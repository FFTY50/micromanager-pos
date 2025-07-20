// Mock Supabase client for testing
const mockSupabaseClient = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({
        data: [{ id: 'mock-id', created_at: new Date().toISOString() }],
        error: null
      }))
    })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => Promise.resolve({
          data: [],
          error: null
        }))
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({
        data: [],
        error: null
      }))
    }))
  })),
  
  channel: jest.fn(() => ({
    on: jest.fn(() => ({
      subscribe: jest.fn()
    }))
  })),
  
  rpc: jest.fn(() => Promise.resolve({
    data: [],
    error: null
  }))
};

const createClient = jest.fn(() => mockSupabaseClient);

module.exports = {
  createClient,
  mockSupabaseClient
};
