const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const { verifyToken } = require('@clerk/backend');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { clerkId: payload.sub }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          clerkId: payload.sub,
          email: payload.email,
          firstName: payload.first_name,
          lastName: payload.last_name
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Listings endpoints
app.get('/api/listings', async (req, res) => {
  try {
    const { type, district, status = 'ACTIVE' } = req.query;
    
    const where = { status };
    if (type) where.type = type;
    if (district) where.district = district;

    const listings = await prisma.listings.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

app.post('/api/listings', authenticateUser, async (req, res) => {
  try {
    const { title, description, type, quantity, unit, price, district } = req.body;

    if (!title || !description || !type || !quantity || !unit || !price || !district) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const listing = await prisma.listings.create({
      data: {
        title,
        description,
        type,
        quantity: parseFloat(quantity),
        unit,
        price: parseFloat(price),
        district,
        userId: req.user.id
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        }
      }
    });

    res.status(201).json(listing);
  } catch (error) {
    console.error('Error creating listing:', error);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

app.put('/api/listings/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, quantity, unit, price, district } = req.body;

    const listing = await prisma.listings.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (listing.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedListing = await prisma.listings.update({
      where: { id },
      data: {
        title,
        description,
        quantity: parseFloat(quantity),
        unit,
        price: parseFloat(price),
        district
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        }
      }
    });

    res.json(updatedListing);
  } catch (error) {
    console.error('Error updating listing:', error);
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

app.delete('/api/listings/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await prisma.listings.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (listing.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.listings.delete({
      where: { id }
    });

    res.json({ message: 'Listing deleted successfully' });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

// Trades endpoints
app.get('/api/trades', authenticateUser, async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({
      where: {
        OR: [
          { buyerId: req.user.id },
          { sellerId: req.user.id }
        ]
      },
      include: {
        listing: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                district: true
              }
            }
          }
        },
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(trades);
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

app.post('/api/trades', authenticateUser, async (req, res) => {
  try {
    const { listingId, quantity } = req.body;

    if (!listingId || !quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const listing = await prisma.listings.findUnique({
      where: { id: listingId },
      include: { user: true }
    });

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (listing.userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot trade with yourself' });
    }

    if (listing.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Listing is not active' });
    }

    if (parseFloat(quantity) > listing.quantity) {
      return res.status(400).json({ error: 'Quantity exceeds available amount' });
    }

    const trade = await prisma.trade.create({
      data: {
        listingId,
        buyerId: req.user.id,
        sellerId: listing.userId,
        quantity: parseFloat(quantity),
        price: listing.price * parseFloat(quantity)
      },
      include: {
        listing: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                district: true
              }
            }
          }
        },
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        }
      }
    });

    res.status(201).json(trade);
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

app.put('/api/trades/:id/status', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const trade = await prisma.trade.findUnique({
      where: { id },
      include: { listing: true }
    });

    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    if (trade.buyerId !== req.user.id && trade.sellerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedTrade = await prisma.trade.update({
      where: { id },
      data: { status },
      include: {
        listing: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                district: true
              }
            }
          }
        },
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            district: true
          }
        }
      }
    });

    res.json(updatedTrade);
  } catch (error) {
    console.error('Error updating trade status:', error);
    res.status(500).json({ error: 'Failed to update trade status' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Water Trading Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
}); 