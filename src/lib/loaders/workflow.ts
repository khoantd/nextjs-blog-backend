import { Workflow } from "@inngest/workflow-kit";
import { prisma } from "../prisma";

export async function loadWorkflow(event: { name: string }) {
  const workflow = await prisma.workflow.findFirst({
    where: {
      trigger: event.name,
      enabled: true,
    },
  });
  return workflow?.workflow as unknown as Workflow;
}
