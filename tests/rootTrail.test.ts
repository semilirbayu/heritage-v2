import { describe, expect, it } from 'vitest';
import { nextRootTrail } from '../src/components/family-view/rootTrail';

describe('root trail', () => {
  it('starts a trail with the first root', () => {
    expect(nextRootTrail([], 'home')).toEqual(['home']);
  });

  it('appends a re-root from search, the profile, or a branch pill', () => {
    expect(nextRootTrail(['home'], 'spouse')).toEqual(['home', 'spouse']);
    expect(nextRootTrail(['home', 'spouse'], 'child')).toEqual(['home', 'spouse', 'child']);
  });

  it('truncates back to someone already on the trail', () => {
    expect(nextRootTrail(['home', 'spouse', 'child'], 'home')).toEqual(['home']);
    expect(nextRootTrail(['home', 'spouse', 'child'], 'spouse')).toEqual(['home', 'spouse']);
  });

  it('leaves the trail unchanged when the current root is chosen again', () => {
    expect(nextRootTrail(['home', 'spouse'], 'spouse')).toEqual(['home', 'spouse']);
  });
});
