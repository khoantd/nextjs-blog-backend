import { PrismaClient } from '@prisma/client'
import { PrismaClient as PrismaClientWithEnv } from '@prisma/client'

const prisma = new PrismaClientWithEnv({
  datasources: {
    db: {
      url: "file:./dev.db"
    }
  }
})

async function main() {
  // Create comprehensive demo blog posts
  const blogPosts = [
    {
      title: 'Getting Started with Next.js and Prisma',
      subtitle: 'A comprehensive guide to building modern web applications',
      status: 'draft',
      markdown: `# Getting Started with Next.js and Prisma

Next.js and Prisma make a powerful combination for building modern web applications with type-safe database access.

## What is Next.js?

Next.js is a React framework that provides server-side rendering, static site generation, and many other features out of the box.

### Key Features
- **Server-Side Rendering (SSR)**: Improve SEO and performance
- **Static Site Generation (SSG)**: Pre-build pages for optimal performance
- **API Routes**: Build full-stack applications with ease
- **Automatic Code Splitting**: Optimized bundle sizes

## What is Prisma?

Prisma is an ORM that makes database access easy and type-safe.

### Benefits
- **Type Safety**: Catch errors at compile time
- **Auto-completion**: Better developer experience
- **Database Migrations**: Version control for your schema
- **Query Optimization**: Efficient database queries

## Getting Started

1. Install dependencies
2. Set up your database
3. Configure Prisma
4. Start building!

## Example Code

\`\`\`typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const users = await prisma.user.findMany()
\`\`\`

This combination provides an excellent developer experience with type safety and performance.`,
    },
    {
      title: 'Advanced TypeScript Patterns',
      subtitle: 'Explore advanced TypeScript concepts and patterns',
      status: 'published',
      markdown: `# Advanced TypeScript Patterns

TypeScript offers many powerful features that can help you write better code.

## Generic Types

Generic types allow you to write flexible and reusable code.

\`\`\`typescript
interface Repository<T> {
  findById(id: string): Promise<T | null>
  save(entity: T): Promise<T>
}

class UserRepository implements Repository<User> {
  async findById(id: string): Promise<User | null> {
    // Implementation
  }
  
  async save(user: User): Promise<User> {
    // Implementation
  }
}
\`\`\`

## Utility Types

TypeScript provides many utility types that make working with types easier.

### Common Utility Types
- **Partial<T>**: Make all properties optional
- **Required<T>**: Make all properties required
- **Pick<T, K>**: Select specific properties
- **Omit<T, K>**: Remove specific properties

## Conditional Types

Conditional types allow you to create type logic:

\`\`\`typescript
type IsString<T> = T extends string ? true : false

type Test1 = IsString<string> // true
type Test2 = IsString<number> // false
\`\`\`

## Conclusion

Mastering TypeScript patterns will make you a more effective developer. These patterns help you write more maintainable, type-safe code.`,
    },
    {
      title: 'Building Scalable APIs with Node.js',
      subtitle: 'Best practices for creating robust backend services',
      status: 'published',
      markdown: `# Building Scalable APIs with Node.js

Creating scalable APIs requires careful planning and adherence to best practices.

## Architecture Patterns

### Layered Architecture
Separate your application into distinct layers:

1. **Controller Layer**: Handle HTTP requests
2. **Service Layer**: Business logic
3. **Repository Layer**: Data access
4. **Model Layer**: Data structures

### Microservices vs Monolith
Choose the right architecture for your needs:

**Microservices:**
- Independent deployment
- Technology diversity
- Fault isolation

**Monolith:**
- Simpler development
- Easier debugging
- Lower operational overhead

## Performance Optimization

### Database Optimization
- Use connection pooling
- Implement proper indexing
- Consider read replicas

### Caching Strategies
- **In-memory caching**: Redis, Memcached
- **CDN caching**: Cloudflare, AWS CloudFront
- **Application caching**: LRU, TTL-based

## Security Best Practices

### Authentication & Authorization
- JWT tokens for stateless auth
- OAuth 2.0 for third-party integration
- Role-based access control

### Data Validation
- Input sanitization
- Schema validation
- Rate limiting

## Monitoring & Logging

Implement comprehensive observability:

\`\`\`javascript
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
})
\`\`\`

## Conclusion

Building scalable APIs is an iterative process. Start with good foundations and evolve based on your requirements.`,
    },
    {
      title: 'React Performance Optimization Techniques',
      subtitle: 'Make your React applications faster and more efficient',
      status: 'under review',
      markdown: `# React Performance Optimization Techniques

Optimizing React applications is crucial for providing a smooth user experience.

## Component Optimization

### React.memo
Prevent unnecessary re-renders:

\`\`\`jsx
const ExpensiveComponent = React.memo(({ data }) => {
  return <div>{/* Complex rendering logic */}</div>
})
\`\`\`

### useMemo and useCallback
Memoize expensive computations and functions:

\`\`\`jsx
const Component = ({ items }) => {
  const expensiveValue = useMemo(() => {
    return items.reduce((sum, item) => sum + item.value, 0)
  }, [items])
  
  const handleClick = useCallback((id) => {
    // Handle click
  }, [])
  
  return <div>{expensiveValue}</div>
}
\`\`\`

## Bundle Optimization

### Code Splitting
Implement lazy loading for better performance:

\`\`\`jsx
const LazyComponent = React.lazy(() => import('./LazyComponent'))

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LazyComponent />
    </Suspense>
  )
}
\`\`\`

### Tree Shaking
Remove unused code from your bundle:
- Use ES6 modules
- Configure webpack properly
- Analyze bundle size with tools

## State Management

### Efficient State Updates
Avoid unnecessary state mutations:

\`\`\`jsx
// Bad - creates new object on every render
const [state, setState] = useState({ count: 0, name: '' })

// Good - use functional updates
const increment = () => {
  setState(prev => ({ ...prev, count: prev.count + 1 }))
}
\`\`\`

## Rendering Optimization

### Virtual Scrolling
Handle large lists efficiently:
- Use react-window or react-virtualized
- Implement windowing techniques
- Consider infinite scrolling

## Conclusion

Performance optimization is an ongoing process. Profile your application, identify bottlenecks, and apply appropriate optimization techniques.`,
    },
    {
      title: 'Introduction to Machine Learning with JavaScript',
      subtitle: 'Explore ML concepts and implement them in JavaScript',
      status: 'draft',
      markdown: `# Introduction to Machine Learning with JavaScript

Machine Learning isn't just for Python developers anymore. JavaScript has become a viable platform for ML applications.

## Why JavaScript for ML?

### Advantages
- **Web Deployment**: Run ML models directly in browsers
- **Full-Stack**: Use same language for frontend and backend
- **Ecosystem**: Rich ecosystem of libraries and tools
- **Accessibility**: No installation required for web-based ML

### Popular Libraries
- **TensorFlow.js**: Google's ML library for JavaScript
- **Brain.js**: Neural network library
- **ML5.js**: Friendly ML library for creative coding
- **Synaptic**: Architecture-agnostic neural network library

## Getting Started with TensorFlow.js

### Installation
\`\`\`bash
npm install @tensorflow/tfjs
\`\`\`

### Basic Example
\`\`\`javascript
import * as tf from '@tensorflow/tfjs'

// Create a simple model
const model = tf.sequential({
  layers: [
    tf.layers.dense({ inputShape: [4], units: 10, activation: 'relu' }),
    tf.layers.dense({ units: 3, activation: 'softmax' })
  ]
})

// Compile the model
model.compile({
  optimizer: 'sgd',
  loss: 'categoricalCrossentropy',
  metrics: ['accuracy']
})
\`\`\`

## Real-World Applications

### Image Recognition
- Browser-based image classification
- Real-time object detection
- Facial recognition systems

### Natural Language Processing
- Sentiment analysis
- Text classification
- Language translation

### Predictive Analytics
- Sales forecasting
- Customer behavior prediction
- Anomaly detection

## Performance Considerations

### WebGPU Acceleration
Leverage GPU acceleration for better performance:
\`\`\`javascript
// Set backend to WebGPU
await tf.setBackend('webgpu')
\`\`\`

### Model Optimization
- Quantization: Reduce model size
- Pruning: Remove unnecessary connections
- Knowledge distillation: Create smaller, efficient models

## Deployment Strategies

### Browser-based ML
- No server costs
- Privacy-preserving
- Real-time processing

### Edge Computing
- TensorFlow.js for Node.js
- Cloudflare Workers
- AWS Lambda

## Conclusion

JavaScript ML opens up new possibilities for web-based AI applications. Start simple and gradually build more complex models as you gain experience.`,
    }
  ]

  const createdBlogPosts = []
  for (const postData of blogPosts) {
    const blogPost = await prisma.blogPost.create({ data: postData })
    createdBlogPosts.push(blogPost)
  }

  // Create comprehensive demo workflows
  const workflows = [
    {
      name: 'Blog Post Review Workflow',
      description: 'Automated workflow for reviewing and publishing blog posts with AI assistance',
      trigger: 'blog-post.created',
      enabled: true,
      workflow: {
        name: 'Blog Post Review Workflow',
        description: 'Automated workflow for reviewing and publishing blog posts with AI assistance',
        actions: [
          {
            id: '1',
            kind: 'add_ToC',
            name: 'Add Table of Contents',
            description: 'Automatically generate a table of contents for the blog post'
          },
          {
            id: '2',
            kind: 'grammar_review',
            name: 'AI Grammar Review',
            description: 'Review content for grammar, spelling, and style improvements'
          },
          {
            id: '3',
            kind: 'wait_for_approval',
            name: 'Editor Approval',
            description: 'Wait for human editor approval before publishing'
          }
        ],
        edges: [
          {
            id: 'edge-source-1',
            from: '$source',
            to: '1'
          },
          {
            id: 'edge-1-2',
            from: '1',
            to: '2'
          },
          {
            id: 'edge-2-3',
            from: '2',
            to: '3'
          }
        ]
      },
    },
    {
      name: 'Social Media Distribution Workflow',
      description: 'Generate and distribute social media content for published blog posts',
      trigger: 'blog-post.published',
      enabled: true,
      workflow: {
        name: 'Social Media Distribution Workflow',
        description: 'Generate and distribute social media content for published blog posts',
        actions: [
          {
            id: '1',
            kind: 'generate_tweet_posts',
            name: 'Generate Twitter Posts',
            description: 'Create engaging Twitter posts from blog content'
          },
          {
            id: '2',
            kind: 'generate_linkedin_posts',
            name: 'Generate LinkedIn Posts',
            description: 'Create professional LinkedIn posts from blog content'
          }
        ],
        edges: [
          {
            id: 'edge-source-1',
            from: '$source',
            to: '1'
          },
          {
            id: 'edge-1-2',
            from: '1',
            to: '2'
          }
        ]
      },
    },
    {
      name: 'Quick Publish Workflow',
      description: 'Fast-track workflow for urgent blog posts',
      trigger: 'blog-post.urgent',
      enabled: false,
      workflow: {
        name: 'Quick Publish Workflow',
        description: 'Fast-track workflow for urgent blog posts',
        actions: [
          {
            id: '1',
            kind: 'grammar_review',
            name: 'Quick Grammar Check',
            description: 'Perform basic grammar and spelling check'
          },
          {
            id: '2',
            kind: 'apply_changes',
            name: 'Auto Apply Changes',
            description: 'Automatically apply AI-suggested improvements'
          }
        ],
        edges: [
          {
            id: 'edge-source-1',
            from: '$source',
            to: '1'
          },
          {
            id: 'edge-1-2',
            from: '1',
            to: '2'
          }
        ]
      },
    },
    {
      name: 'Content Enhancement Workflow',
      description: 'Enhance existing blog posts with additional content and SEO optimization',
      trigger: 'blog-post.updated',
      enabled: false,
      workflow: {
        name: 'Content Enhancement Workflow',
        description: 'Enhance existing blog posts with additional content and SEO optimization',
        actions: [
          {
            id: '1',
            kind: 'add_ToC',
            name: 'Update Table of Contents',
            description: 'Update or add table of contents for better navigation'
          },
          {
            id: '2',
            kind: 'grammar_review',
            name: 'Content Enhancement',
            description: 'Enhance content with better structure and readability'
          },
          {
            id: '3',
            kind: 'wait_for_approval',
            name: 'Content Review',
            description: 'Wait for content review and approval'
          }
        ],
        edges: [
          {
            id: 'edge-source-1',
            from: '$source',
            to: '1'
          },
          {
            id: 'edge-1-2',
            from: '1',
            to: '2'
          },
          {
            id: 'edge-2-3',
            from: '2',
            to: '3'
          }
        ]
      },
    }
  ]

  const createdWorkflows = []
  for (const workflowData of workflows) {
    const workflow = await prisma.workflow.create({ data: workflowData })
    createdWorkflows.push(workflow)
  }

  console.log('Database seeded successfully!')
  console.log(`Created ${createdBlogPosts.length} blog posts:`)
  createdBlogPosts.forEach((post, index) => {
    console.log(`  ${index + 1}. "${post.title}" (${post.status})`)
  })
  console.log(`Created ${createdWorkflows.length} workflows:`)
  createdWorkflows.forEach((workflow, index) => {
    console.log(`  ${index + 1}. "${workflow.name}" - ${workflow.enabled ? 'Enabled' : 'Disabled'}`)
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
