import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { getCurrentUser } from '../lib/auth-utils';
import { canManageWorkflows } from '../lib/auth';

const router = Router();

// GET /api/workflows - Fetch all workflows
router.get('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canManageWorkflows(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions to manage workflows" });
    }

    const workflows = await prisma.workflow.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({ data: { workflows } });
  } catch (error) {
    console.error("Error fetching workflows:", error);
    return res.status(500).json({ error: "Failed to fetch workflows" });
  }
});

// POST /api/workflows - Create a new workflow
router.post('/', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canManageWorkflows(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions to create workflows" });
    }

    const { name, description, workflow, trigger, enabled } = req.body;

    if (!name || !workflow) {
      return res.status(400).json({ error: "Name and workflow configuration are required" });
    }

    const newWorkflow = await prisma.workflow.create({
      data: {
        name,
        description: description || null,
        workflow: workflow,
        trigger: trigger || null,
        enabled: enabled || false,
      },
    });

    return res.status(201).json({ data: { workflow: newWorkflow } });
  } catch (error) {
    console.error("Error creating workflow:", error);
    return res.status(500).json({ error: "Failed to create workflow" });
  }
});

// PUT /api/workflows/:id - Update a workflow
router.put('/:id', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!canManageWorkflows(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions to update workflows" });
    }

    const { id } = req.params;
    const { name, description, workflow, trigger, enabled } = req.body;

    const updatedWorkflow = await prisma.workflow.update({
      where: { id: Number(id) },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(workflow && { workflow }),
        ...(trigger !== undefined && { trigger }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    return res.json({ data: { workflow: updatedWorkflow } });
  } catch (error) {
    console.error("Error updating workflow:", error);
    return res.status(500).json({ error: "Failed to update workflow" });
  }
});

export default router;
