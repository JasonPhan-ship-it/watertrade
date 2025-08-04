# 💧 Water Trading Platform

A modern web platform that allows farmers to buy and sell water and water credits. Built with Next.js, Node.js, and PostgreSQL.

## 🌟 Features

- **User Authentication**: Secure sign-up/login via Clerk
- **Marketplace**: Browse and filter water listings by type, district, and price
- **Create Listings**: Post water for sale or request to buy
- **Trade Management**: Execute trades with escrow-style pending states
- **Dashboard**: View active listings and trade history
- **Real-time Updates**: Track trade status and listing details

## 🏗️ Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **TailwindCSS** - Utility-first CSS framework
- **shadcn/ui** - Beautiful, accessible UI components
- **Clerk** - Authentication and user management

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **Prisma ORM** - Database toolkit
- **PostgreSQL** - Relational database

### Deployment
- **Vercel** - Frontend hosting
- **Railway** - Backend hosting and database

## 📁 Project Structure

```
water-trading-platform/
├── frontend/                 # Next.js frontend application
│   ├── app/                 # App Router pages
│   ├── components/          # Reusable UI components
│   ├── lib/                 # Utility functions and API client
│   └── ...
├── server/                  # Node.js backend application
│   ├── prisma/             # Database schema and migrations
│   ├── index.js            # Express server
│   └── ...
└── README.md               # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Clerk account for authentication

### 1. Clone the Repository

```bash
git clone https://github.com/JasonPhan-ship-it/watertrade.git
cd water-trading-platform
```

### 2. Backend Setup

```bash
cd server

# Install dependencies
npm install

# Copy environment variables
cp env.example .env

# Edit .env with your configuration
# DATABASE_URL=postgresql://username:password@localhost:5432/water_trading
# CLERK_SECRET_KEY=your_clerk_secret_key
# CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# Start development server
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment variables
cp env.example .env.local

# Edit .env.local with your configuration
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
# NEXT_PUBLIC_API_URL=http://localhost:3001

# Start development server
npm run dev
```

### 4. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Database: Configured via DATABASE_URL

## 🔧 Environment Variables

### Backend (.env)

```env
DATABASE_URL="postgresql://username:password@localhost:5432/water_trading"
CLERK_SECRET_KEY="sk_test_your_clerk_secret_key_here"
CLERK_PUBLISHABLE_KEY="pk_test_your_clerk_publishable_key_here"
PORT=3001
NODE_ENV=development
FRONTEND_URL="http://localhost:3000"
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key_here
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 📊 Database Schema

### Users
- Authentication via Clerk
- Profile information (name, email, district)

### Listings
- Water resource listings (sale/buy requests)
- Quantity, price, unit, district
- Status tracking (active, sold, cancelled, expired)

### Trades
- Transaction records between buyers and sellers
- Escrow-style status management (pending, completed, cancelled, disputed)

## 🚀 Deployment

### Backend (Railway)

1. Connect your GitHub repository to Railway
2. Add PostgreSQL plugin
3. Set environment variables in Railway dashboard
4. Deploy automatically on push to main branch

### Frontend (Vercel)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

## 🔐 Authentication Setup

1. Create a Clerk account at https://clerk.com
2. Create a new application
3. Copy your publishable and secret keys
4. Configure authentication providers as needed
5. Update environment variables in both frontend and backend

## 📝 API Endpoints

### Listings
- `GET /api/listings` - Fetch all listings with filters
- `POST /api/listings` - Create new listing (auth required)
- `PUT /api/listings/:id` - Update listing (auth required)
- `DELETE /api/listings/:id` - Delete listing (auth required)

### Trades
- `GET /api/trades` - Fetch user's trades (auth required)
- `POST /api/trades` - Create new trade (auth required)
- `PUT /api/trades/:id/status` - Update trade status (auth required)

## 🎨 UI Components

The application uses shadcn/ui components with a custom water trading theme:

- **Water Colors**: Blue tones for water-related elements
- **Earth Colors**: Brown/beige tones for natural elements
- **Responsive Design**: Mobile-first approach
- **Accessibility**: WCAG compliant components

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, please open an issue in the GitHub repository or contact the development team.

---

**Built with ❤️ for sustainable water resource management** 