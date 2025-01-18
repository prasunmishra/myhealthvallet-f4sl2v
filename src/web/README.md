# PHRSAT Web Application

## Project Overview

PHRSAT (Personal Health Record Store and Analysis Tool) is a comprehensive digital health platform built with React and TypeScript. This web application serves as the primary interface for users to manage their health records, view analytics, and interact with health data.

### Key Features
- Secure health record management
- Real-time health analytics dashboard
- Integration with health platforms (Apple Health, Google Fit)
- HIPAA-compliant data handling
- Responsive design for all devices
- Accessibility-first approach (WCAG 2.1 AAA compliant)

## Technology Stack

### Core Technologies
- React 18+ - Frontend framework
- TypeScript 5.0+ - Type-safe development
- Material-UI 5.14+ - UI component library
- Redux Toolkit 1.9+ - State management
- React Router 6+ - Navigation
- Axios - HTTP client

### Development Tools
- ESLint - Code linting
- Prettier - Code formatting
- Jest - Unit testing
- React Testing Library - Component testing
- Storybook - Component documentation
- Webpack 5 - Module bundling

## Getting Started

### Prerequisites
- Node.js (v16.x or higher)
- npm (v8.x or higher)
- Git

### Installation
```bash
# Clone the repository
git clone [repository-url]
cd src/web

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

### Development Server
```bash
# Start development server
npm start

# Run tests
npm test

# Launch Storybook
npm run storybook
```

## Development Guidelines

### Code Structure
```
src/
├── assets/         # Static assets
├── components/     # Reusable UI components
├── config/         # Configuration files
├── hooks/          # Custom React hooks
├── layouts/        # Page layouts
├── pages/          # Route components
├── services/       # API services
├── store/          # Redux store
├── styles/         # Global styles
├── types/          # TypeScript definitions
└── utils/          # Utility functions
```

### Coding Standards
- Follow TypeScript strict mode guidelines
- Use functional components with hooks
- Implement proper error boundaries
- Write comprehensive unit tests
- Document components using JSDoc

### Git Workflow
- Feature branches from `develop`
- Pull requests require code review
- Conventional commit messages
- Automated CI checks must pass

## Security Implementation

### Authentication
- OAuth 2.0 + OIDC implementation
- JWT token management
- Secure session handling
- MFA support

### Data Protection
- End-to-end encryption for PHI
- XSS prevention
- CSRF protection
- Secure localStorage handling

## Testing Strategy

### Unit Testing
```bash
# Run unit tests
npm test

# Generate coverage report
npm run test:coverage
```

### Integration Testing
```bash
# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

## Performance Optimization

### Build Optimization
- Code splitting
- Tree shaking
- Dynamic imports
- Asset optimization

### Runtime Performance
- Memoization
- Virtual scrolling
- Lazy loading
- Service worker caching

## Accessibility

### Implementation
- ARIA labels
- Keyboard navigation
- Screen reader support
- Color contrast compliance
- Focus management

### Testing
```bash
# Run accessibility tests
npm run test:a11y
```

## Build & Deployment

### Production Build
```bash
# Create production build
npm run build

# Analyze bundle size
npm run analyze
```

### Docker Deployment
```bash
# Build Docker image
docker build -t phrsat-web .

# Run container
docker run -p 80:80 phrsat-web
```

### CI/CD Pipeline
- GitHub Actions workflow
- Automated testing
- Security scanning
- Deployment automation

## Troubleshooting

### Common Issues
- Environment configuration
- Build failures
- Testing issues
- Performance problems

### Debug Tools
- React Developer Tools
- Redux DevTools
- Chrome DevTools
- Lighthouse

### Support Resources
- Technical documentation
- API documentation
- Component storybook
- Team contact information

## License

Copyright © 2023 PHRSAT. All rights reserved.