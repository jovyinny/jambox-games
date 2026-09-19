import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createInitialState, useAppStore } from '../../state/store';
import { TimingCallout } from './TimingCallout';

beforeEach(() => { vi.useFakeTimers(); useAppStore.setState(createInitialState()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('shows only the lane that received a new hit and expires its feedback', () => {
  render(<TimingCallout />);
  act(() => useAppStore.getState().updateLane('left', { lastGrade: 'perfect', hitCount: 1 }));
  expect(screen.getAllByText('PERFECT')).toHaveLength(1);
  act(() => useAppStore.getState().updateLane('middle', { lastGrade: 'good', hitCount: 1 }));
  expect(screen.getAllByText('PERFECT')).toHaveLength(1);
  expect(screen.getByText('GOOD')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(601));
  expect(screen.queryByText('PERFECT')).not.toBeInTheDocument();
  expect(screen.queryByText('GOOD')).not.toBeInTheDocument();
});
