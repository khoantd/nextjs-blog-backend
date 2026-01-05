export interface WorkflowStep {
  id: string;
  kind: string;
  name: string;
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  trigger: string;
  steps: WorkflowStep[];
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    name: "blog-review-workflow",
    description: "Automated blog post review with AI assistance",
    trigger: "blog-post.updated",
    steps: [
      {
        id: "1",
        kind: "add_ToC",
        name: "Add Table of Contents"
      },
      {
        id: "2",
        kind: "grammar_review",
        name: "Grammar Review"
      },
      {
        id: "3",
        kind: "wait_for_approval",
        name: "Wait for Approval"
      }
    ]
  },
  {
    name: "social-media-workflow",
    description: "Generate social media content for published posts",
    trigger: "blog-post.published",
    steps: [
      {
        id: "1",
        kind: "generate_linkedin_posts",
        name: "Generate LinkedIn Posts"
      },
      {
        id: "2",
        kind: "generate_tweet_posts",
        name: "Generate Twitter Posts"
      }
    ]
  },
  {
    name: "quick-publish-workflow",
    description: "Fast-track workflow for urgent posts",
    trigger: "blog-post.updated",
    steps: [
      {
        id: "1",
        kind: "grammar_review",
        name: "Quick Grammar Review"
      },
      {
        id: "2",
        kind: "apply_changes",
        name: "Apply Changes"
      }
    ]
  }
];

export const availableActions = [
  { kind: "add_ToC", name: "Add Table of Contents", description: "Add an AI-generated ToC" },
  { kind: "grammar_review", name: "Grammar Review", description: "Use OpenAI for grammar fixes" },
  { kind: "wait_for_approval", name: "Wait for Approval", description: "Request approval for changes" },
  { kind: "apply_changes", name: "Apply Changes", description: "Save the AI revisions" },
  { kind: "generate_linkedin_posts", name: "Generate LinkedIn Posts", description: "Generate LinkedIn posts" },
  { kind: "generate_tweet_posts", name: "Generate Twitter Posts", description: "Generate Twitter posts" }
];

export function getWorkflowTemplate(templateName: string): WorkflowTemplate | undefined {
  return workflowTemplates.find(template => template.name === templateName);
}

export function formatWorkflowAsJson(template: WorkflowTemplate): string {
  // Convert steps to actions format expected by Inngest workflow editor
  // Match the structure that works with the automation editor (like Blog Post Review Workflow)
  const actions = template.steps.map(step => ({
    id: step.id,
    kind: step.kind,
    name: step.name,
    description: step.name // Add description field to match working workflow structure
  }));

  // Create edges connecting the actions in sequence
  // Add explicit id fields to edges to match working workflow structure
  // NOTE: Do NOT include edge to $sink - the Inngest workflow kit auto-generates it
  const edges = [];
  if (actions.length > 0) {
    // Connect source to first action
    edges.push({ 
      id: `edge-source-${actions[0].id}`,
      from: "$source", 
      to: actions[0].id 
    });
    
    // Connect actions to each other (but NOT to sink - kit handles that)
    for (let i = 0; i < actions.length - 1; i++) {
      edges.push({ 
        id: `edge-${actions[i].id}-${actions[i + 1].id}`,
        from: actions[i].id, 
        to: actions[i + 1].id 
      });
    }
    // Do NOT add edge to $sink - the Inngest workflow kit auto-generates it
  }

  // Create workflow data matching the structure that works with automation editor
  // Include description at workflow level and only use actions (not steps) to avoid conflicts
  const workflowData = {
    name: template.name,
    description: template.description, // Add description at workflow level
    actions, // Use actions array (matches working workflow structure)
    edges
    // Removed steps array to match working workflow structure and avoid conflicts
  };

  return JSON.stringify(workflowData, null, 2);
}
