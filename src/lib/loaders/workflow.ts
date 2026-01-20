import { prisma } from "../prisma";

// Simple workflow type definition (no dependency on @inngest/workflow-kit)
export interface Workflow {
  name?: string;
  description?: string;
  actions?: unknown[];
  edges?: unknown[];
  [key: string]: unknown;
}

export async function loadWorkflow(event: { name: string }): Promise<Workflow | null> {
  const workflow = await prisma.workflow.findFirst({
    where: {
      trigger: event.name,
      enabled: true,
    },
  });
  return (workflow?.workflow as Workflow) || null;
}
