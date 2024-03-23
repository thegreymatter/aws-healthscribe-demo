// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React, { memo } from 'react';

import { useNavigate } from 'react-router-dom';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import TextContent from '@cloudscape-design/components/text-content';

import { useAuthContext } from '@/store/auth';

function Welcome() {
    const navigate = useNavigate();
    const { user } = useAuthContext();

    function Content() {
        if (user) {
            return <TextContent>demo app</TextContent>;
        } else {
            return <Alert>Log in for full functionality.</Alert>;
        }
    }

    function Footer() {
        return <Box textAlign="center" color="text-body-secondary" fontSize="body-s"></Box>;
    }

    return (
        <ContentLayout header={<Header variant="h2">Demo Scribe Application powered by AWS</Header>}>
            <Container footer={<Footer />}>
                <Content />
            </Container>
        </ContentLayout>
    );
}

export default memo(Welcome);
