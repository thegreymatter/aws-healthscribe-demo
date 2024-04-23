// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React, { Suspense, lazy } from 'react';

import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from '@cloudscape-design/components/app-layout';
import Flashbar from '@cloudscape-design/components/flashbar';
import { Theme, applyTheme } from '@cloudscape-design/components/theming';

import { Amplify } from 'aws-amplify';

import awsExports from '@/aws-exports';
import SuspenseLoader from '@/components/SuspenseLoader';
import TopNav from '@/components/TopNav';
import { useAuthContext } from '@/store/auth';
import { useNotificationsContext } from '@/store/notifications';
import { isUserEmailVerified } from '@/utils/Auth/isUserEmailVerified';
import Welcome from '../Welcome';

Amplify.configure(awsExports);

// Lazy components

const Conversation = lazy(() => import('@/components/Conversation'));
const NewConversation = lazy(() => import('@/components/NewConversation'));

const theme: Theme = {
    tokens: {},
    contexts: {
        header: {
            tokens: {
                colorBackgroundLayoutMain: '#FAF7FF ',
            },
        },
        'top-navigation': {
            tokens: {
                colorBackgroundContainerContent: '#6941C6 ',
            },
        },
    },
};

applyTheme({ theme });

export default function App() {
    const { user } = useAuthContext();
    const { flashbarItems } = useNotificationsContext();

    applyTheme({ theme });

    const content = (
        <Suspense fallback={<SuspenseLoader />}>
            {isUserEmailVerified(user) ? (
                <Routes>
                    <Route path="/conversation/:conversationName" element={<Conversation />} />
                    <Route path="/" element={<NewConversation />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            ) : (
                <Routes>
                    <Route path="*" element={<Welcome />} />
                </Routes>
            )}
        </Suspense>
    );

    return (
        <>
            <div id="appTopNav">
                <TopNav />
            </div>
            <AppLayout
                disableContentPaddings={true}
                toolsHide={true}
                navigationHide={true}
                notifications={<Flashbar items={flashbarItems} />}
                content={<div style={{ padding: '0px 20px 0px 20px' }}>{content}</div>}
                headerSelector="#appTopNav"
            />
        </>
    );
}
