// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React, { useEffect, useMemo, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Popover from '@cloudscape-design/components/popover';
import RadioGroup from '@cloudscape-design/components/radio-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import TokenGroup from '@cloudscape-design/components/token-group';

import { Progress } from '@aws-sdk/lib-storage';
import dayjs from 'dayjs';

import { useS3 } from '@/hooks/useS3';
import { useNotificationsContext } from '@/store/notifications';
import { startMedicalScribeJob } from '@/utils/HealthScribeApi';
import { multipartUpload } from '@/utils/S3Api';
import sleep from '@/utils/sleep';

import amplifyCustom from '../../aws-custom.json';
import AudioRecorder from './AudioRecorder';
import { AudioDropzone } from './Dropzone';
import { AudioDetailSettings, AudioIdentificationType, InputName } from './FormComponents';
import styles from './NewConversation.module.css';
import { verifyJobParams } from './formUtils';
import { AudioDetails, AudioSelection } from './types';

function generateFilename(): string {
    const now = new Date();

    const year = now.getFullYear();
    // Get month and add leading zero if needed
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    // Get day and add leading zero if needed
    const day = now.getDate().toString().padStart(2, '0');
    // Get hours and add leading zero if needed
    const hours = now.getHours().toString().padStart(2, '0');
    // Get minutes and add leading zero if needed
    const minutes = now.getMinutes().toString().padStart(2, '0');

    const filename = `session-${year}-${month}-${day}-${hours}-${minutes}`;
    return filename;
}

export default function NewConversation() {
    const { updateProgressBar } = useNotificationsContext();
    const navigate = useNavigate();

    const [isSubmitting, setIsSubmitting] = useState<boolean>(false); // is job submitting
    const [formError, setFormError] = useState<string | JSX.Element[]>('');
    const [jobName, setJobName] = useState<string>(generateFilename()); // form - job name
    const [audioSelection, setAudioSelection] = useState<AudioSelection>('speakerPartitioning'); // form - audio selection
    // form - audio details
    const [audioDetails, setAudioDetails] = useState<AudioDetails>({
        speakerPartitioning: {
            maxSpeakers: 2,
        },
        channelIdentification: {
            channel1: 'CLINICIAN',
        },
    });
    const [filePath, setFilePath] = useState<File>(); // only one file is allowd from react-dropzone. NOT an array
    const [outputBucket, getUploadMetadata] = useS3(); // outputBucket is the Amplify bucket, and uploadMetadata contains uuid4

    const [submissionMode, setSubmissionMode] = useState<string>('uploadRecording'); // to hide or show the live recorder
    const [recordedAudio, setRecordedAudio] = useState<File | undefined>(); // audio file recorded via live recorder

    // Set array for TokenGroup items
    const fileToken = useMemo(() => {
        if (!filePath) {
            return undefined;
        } else {
            return {
                label: filePath.name,
                description: `Size: ${Number((filePath.size / 1000).toFixed(2)).toLocaleString()} kB`,
            };
        }
    }, [filePath]);

    /**
     * @description Callback function used by the lib-storage SDK Upload function. Updates the progress bar
     *              with the status of the upload
     * @param {number} loaded - number of bytes uploaded
     * @param {number} part - number of the part that was uploaded
     * @param {number} total - total number of bytes to be uploaded
     */
    function s3UploadCallback({ loaded, part, total }: Progress) {
        // Last 1% is for submitting to the HealthScribe API
        const value = Math.round(((loaded || 1) / (total || 100)) * 99);
        const loadedMb = Math.round((loaded || 1) / 1024 / 1024);
        const totalMb = Math.round((total || 1) / 1024 / 1024);
        updateProgressBar({
            id: `New HealthScribe Job: ${jobName}`,
            value: value,
            description: `Uploaded part ${part}, ${loadedMb}MB / ${totalMb}MB`,
        });
    }

    /**
     * @description Submit the form to create a new HealthScribe job
     */
    async function submitJob(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsSubmitting(true);
        setFormError('');

        // build job params with StartMedicalScribeJob request syntax
        const audioParams =
            audioSelection === 'speakerPartitioning'
                ? {
                      Settings: {
                          MaxSpeakerLabels: audioDetails.speakerPartitioning.maxSpeakers,
                          ShowSpeakerLabels: true,
                      },
                  }
                : {
                      ChannelDefinitions: [
                          {
                              ChannelId: 0,
                              ParticipantRole: audioDetails.channelIdentification.channel1,
                          },
                          {
                              ChannelId: 1,
                              ParticipantRole:
                                  audioDetails.channelIdentification.channel1 === 'CLINICIAN' ? 'PATIENT' : 'CLINICIAN',
                          },
                      ],
                      Settings: {
                          ChannelIdentification: true,
                      },
                  };

        const uploadLocation = getUploadMetadata();
        const s3Location = {
            Bucket: uploadLocation.bucket,
            Key: `${uploadLocation.key}/${(filePath as File).name}`,
        };

        const jobParams = {
            MedicalScribeJobName: jobName,
            DataAccessRoleArn: amplifyCustom.healthScribeServiceRole,
            OutputBucketName: outputBucket,
            Media: {
                MediaFileUri: `s3://${s3Location.Bucket}/${s3Location.Key}`,
            },
            ...audioParams,
        };

        const verifyParamResults = verifyJobParams(jobParams);
        if (!verifyParamResults.verified) {
            setFormError(verifyParamResults.message);
            setIsSubmitting(false);
            return;
        }

        // Scroll to top
        window.scrollTo(0, 0);

        // Add initial progress flash message
        updateProgressBar({
            id: `New HealthScribe Job: ${jobName}`,
            value: 0,
            description: 'Upload to S3 in progress...',
        });

        try {
            await multipartUpload({
                ...s3Location,
                Body: filePath as File,
                ContentType: filePath?.type,
                callbackFn: s3UploadCallback,
            });
        } catch (e) {
            updateProgressBar({
                id: `New HealthScribe Job: ${jobName}`,
                type: 'error',
                value: 0,
                description: 'Uploading files to S3 failed',
                additionalInfo: `Error uploading ${filePath!.name}: ${(e as Error).message}`,
            });
            setIsSubmitting(false);
            throw e;
        }

        try {
            const startJob = await startMedicalScribeJob(jobParams);
            if (startJob?.data?.MedicalScribeJob?.MedicalScribeJobStatus) {
                updateProgressBar({
                    id: `New HealthScribe Job: ${jobName}`,
                    type: 'success',
                    value: 100,
                    description: 'HealthScribe job submitted',
                    additionalInfo: `Audio file successfully uploaded to S3 and submitted to HealthScribe at ${dayjs
                        .unix(startJob.data.MedicalScribeJob.StartTime)
                        .format('MM/DD/YYYY hh:mm A')}. Redirecting to conversation list in 5 seconds.`,
                });
                await sleep(500);
                navigate('/conversations');
            } else {
                updateProgressBar({
                    id: `New HealthScribe Job: ${jobName}`,
                    type: 'info',
                    value: 100,
                    description: 'Unable to confirm HealthScribe job submission',
                    additionalInfo: `Response from HealthScribe: ${JSON.stringify(startJob?.data)}`,
                });
            }
        } catch (e) {
            updateProgressBar({
                id: `New HealthScribe Job: ${jobName}`,
                type: 'error',
                value: 0,
                description: 'Submitting job to HealthScribe failed',
                additionalInfo: `Error submitting job to HealthScribe: ${(e as Error).message}`,
            });
            setIsSubmitting(false);
            throw e;
        }

        setIsSubmitting(false);
    }

    useEffect(() => {
        setFilePath(recordedAudio);
    }, [recordedAudio]);

    return (
        <ContentLayout
            header={
                <Header description="Upload your audio file to be processed by  HealthScribe" variant="awsui-h1-sticky">
                    New Conversation
                </Header>
            }
        >
            <Container>
                <form onSubmit={(e) => submitJob(e)}>
                    <Form
                        errorText={formError}
                        actions={
                            <SpaceBetween direction="horizontal" size="xs">
                                {isSubmitting ? (
                                    <Button formAction="submit" variant="primary" disabled={true}>
                                        <Spinner />
                                    </Button>
                                ) : (
                                    <Button formAction="submit" variant="primary" disabled={!filePath}>
                                        Transcribe Session
                                    </Button>
                                )}
                            </SpaceBetween>
                        }
                    >
                        <SpaceBetween direction="vertical" size="xl">
                            <InputName jobName={jobName} setJobName={setJobName} />
                            {/*    <AudioIdentificationType

                                audioSelection={audioSelection}
                                setAudioSelection={setAudioSelection}
                            />
                            <AudioDetailSettings
                                audioSelection={audioSelection}
                                audioDetails={audioDetails}
                                setAudioDetails={setAudioDetails}
                            /> */}
                            <FormField
                                label={
                                    <SpaceBetween direction="horizontal" size="xs">
                                        <div>Session Recording Type</div>
                                    </SpaceBetween>
                                }
                            >
                                <SpaceBetween direction="vertical" size="xl">
                                    <div className={styles.submissionModeRadio}>
                                        <RadioGroup
                                            ariaLabel="submissionMode"
                                            onChange={({ detail }) => setSubmissionMode(detail.value)}
                                            value={submissionMode}
                                            items={[
                                                { value: 'uploadRecording', label: 'Upload Recording' },
                                                { value: 'liveRecording', label: 'Live Recording' },
                                            ]}
                                        />
                                    </div>
                                    {submissionMode === 'liveRecording' ? (
                                        <>
                                            <FormField
                                                label="Live Recording"
                                                description="Note: You may only record one live recording at a time."
                                            ></FormField>
                                            <AudioRecorder setRecordedAudio={setRecordedAudio} />
                                        </>
                                    ) : (
                                        <FormField label="Select Files">
                                            <AudioDropzone setFilePath={setFilePath} setFormError={setFormError} />
                                            <TokenGroup
                                                i18nStrings={{
                                                    limitShowFewer: 'Show fewer files',
                                                    limitShowMore: 'Show more files',
                                                }}
                                                onDismiss={() => {
                                                    setFilePath(undefined);
                                                }}
                                                items={fileToken ? [fileToken] : []}
                                                alignment="vertical"
                                                limit={1}
                                            />
                                        </FormField>
                                    )}
                                </SpaceBetween>
                            </FormField>
                        </SpaceBetween>
                    </Form>
                </form>
            </Container>
        </ContentLayout>
    );
}
