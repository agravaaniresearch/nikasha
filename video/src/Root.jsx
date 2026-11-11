import React from 'react';
import { Composition } from 'remotion';
import { Explainer, DURATION } from './Video';

export const RemotionRoot = () => (
  <Composition id="Explainer" component={Explainer} durationInFrames={DURATION} fps={30} width={1920} height={1080} />
);
