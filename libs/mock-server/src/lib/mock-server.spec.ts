import { mockServer } from './mock-server';

describe('mockServer', () => {
  it('should work', () => {
    expect(mockServer()).toEqual('mock-server');
  });
});
