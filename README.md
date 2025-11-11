# Water Trading Platform - Enhanced README

A comprehensive water rights marketplace platform built with Next.js, enabling farmers and water districts to trade water allocations, credits, and rights efficiently.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- npm or yarn

### Development Setup

1. **Clone and install dependencies**
```bash
git clone https://github.com/JasonPhan-ship-it/water-trading-platform.git
cd water-trading-platform/frontend
npm install
```

2. **Set up environment variables**
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

3. **Start local database (optional)**
```bash
docker-compose up -d postgres
```

4. **Initialize database**
```bash
npm run db:migrate
npm run db:seed # Optional: populate with sample data
```

5. **Start development server**
```bash
npm run dev
```

## 📁 Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── (auth)/            # Auth-protected routes
│   ├── admin/             # Admin interface
│   └── globals.css        # Global styles
├── components/            # Reusable UI components
│   ├── ui/               # Base UI components
│   └── forms/            # Form components
├── lib/                  # Utilities and configurations
│   ├── prisma.ts         # Database client
│   ├── auth.ts           # Authentication helpers
│   ├── email.ts          # Email utilities
│   └── api-utils.ts      # API utilities
├── prisma/               # Database schema and migrations
├── public/               # Static assets
└── middleware.ts         # Next.js middleware
```

## 🛠️ Available Scripts

### Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking
```

### Database
```bash
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:deploy    # Deploy migrations (production)
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed database with sample data
npm run db:reset     # Reset database (development only)
```

### Testing
```bash
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run test:ci      # Run tests for CI
```

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **Authentication**: Clerk
- **Payments**: Stripe (optional)
- **Email**: Resend
- **Deployment**: Vercel (frontend), Railway (database)

### Key Features
- **Marketplace**: Browse, filter, and search water listings
- **Trading**: Execute buy-now purchases and submit offers
- **Auctions**: Bid on auction-style listings
- **User Management**: Profile management and onboarding
- **Admin Panel**: Manage users, listings, and transactions
- **Analytics**: Market insights and pricing trends
- **Premium Features**: Advanced analytics and early access

## 🔐 Security

### Authentication & Authorization
- Clerk handles user authentication
- Middleware enforces route protection
- Role-based access control (USER/ADMIN)
- Session-based onboarding flow

### Data Protection
- Input validation with Zod schemas
- SQL injection protection via Prisma
- XSS protection with Content Security Policy
- Rate limiting on API endpoints

### Security Headers
- HSTS, CSRF protection
- Content Security Policy
- X-Frame-Options, X-Content-Type-Options

## 📊 Monitoring

### Performance Monitoring
- API response time tracking
- Database query performance
- Error tracking and alerting
- Health check endpoints

### Analytics
- User engagement metrics
- Transaction volume tracking
- Listing performance analytics
- Premium feature usage

## 🚀 Deployment

### Environment Variables

**Required:**
```env
DATABASE_URL="postgresql://..."
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
```

**Optional:**
```env
RESEND_API_KEY="re_..."           # Email notifications
EMAIL_FROM="no-reply@yourdomain.com"
STRIPE_SECRET_KEY="sk_..."        # Premium subscriptions
STRIPE_WEBHOOK_SECRET="whsec_..."
```

## 🧰 Troubleshooting

### Clerk sign up returns HTTP 422

The sign-up screen is implemented with Clerk’s hosted `<SignUp />` widget in `app/sign-up/[[...sign-up]]/page.tsx`, wrapped by the global `<ClerkProvider>` in `app/layout.tsx`. If you see `deep-chimp-76.clerk.accounts.dev/v1/client/sign_ups ... 422`, Clerk is rejecting the sign-up before the form renders. This usually happens when the publishable key does not match the application or the current origin is not listed in your Clerk dashboard. Double-check that:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` matches the application you are testing against.
- The application’s Allowed Origins include the domain you are running locally (e.g. `http://localhost:3000`).
- Development Sessions are valid; revoke expired dev sessions from the Clerk dashboard if the `_clerk_session` or `__dev_session` cookies are stale.

Without a valid publishable key/origin pairing, Clerk cannot create the anonymous client needed for sign-up, so the widget throws `Minified React error #310` from inside the provider context. Once the keys and origins line up, the 422 disappears and the Clerk widget handles validation inside the page.

### Production Deployment

1. **Frontend (Vercel)**
   - Connect GitHub repository
   - Set environment variables
   - Deploy automatically on push

2. **Database (Railway/Neon)**
   - Create PostgreSQL instance
   - Run migrations: `npm run db:deploy`
   - Update DATABASE_URL

3. **Domain & SSL**
   - Configure custom domain
   - SSL automatically handled by Vercel

## 🧪 Testing Strategy

### Unit Tests
- Component testing with React Testing Library
- API route testing with mocked dependencies
- Utility function testing

### Integration Tests
- Database integration tests
- Authentication flow tests
- Email delivery tests

### E2E Tests (Future)
- Critical user journeys
- Payment flow testing
- Admin functionality

## 📈 Performance Optimization

### Frontend
- Image optimization with Next.js Image
- Code splitting and lazy loading
- Bundle analysis and optimization
- CDN delivery via Vercel

### Backend
- Database query optimization
- Connection pooling
- Caching strategies
- API response optimization

### Database
- Proper indexing strategy
- Query performance monitoring
- Connection limits and pooling

## 🔧 Development Workflow

### Code Quality
- ESLint and Prettier configuration
- TypeScript strict mode
- Pre-commit hooks with Husky
- Automated testing in CI/CD

### Git Workflow
- Feature branches for development
- Pull request reviews required
- Automated testing on PRs
- Automatic deployment from main

## 📝 API Documentation

### Listings API
```typescript
GET /api/listings
POST /api/listings
GET /api/listings/[id]
PUT /api/listings/[id]
DELETE /api/listings/[id]
```

### Transactions API
```typescript
POST /api/transactions      # Create transaction
GET /api/transactions/[id]  # Get transaction details
POST /api/transactions/[id]/kickoff # Start workflow
```

### Admin API
```typescript
GET /api/admin/users        # Manage users
GET /api/admin/listings     # Manage listings
GET /api/admin/analytics    # View analytics
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new features
- Update documentation for API changes
- Follow existing code style and patterns

## 📞 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Open GitHub issues for bugs and feature requests
- **Email**: support@watertraders.com
- **Status**: Check system status at status.watertraders.com

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for sustainable water resource management**
