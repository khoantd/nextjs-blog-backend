/**
 * Stub Inngest client for backend API
 * The backend doesn't actually use Inngest - workflows are handled by the frontend Next.js app
 * This stub exists to satisfy TypeScript imports and prevent build errors
 */

export const inngest = {
  send: async (event: { name: string; data?: Record<string, unknown> }) => {
    // No-op: Inngest events are sent from the frontend Next.js app
    console.log(`[Inngest Stub] Event would be sent: ${event.name}`, event.data);
    return Promise.resolve();
  },
};
