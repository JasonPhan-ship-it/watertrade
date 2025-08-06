// frontend/pages/api/listings.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma' // Adjust path if needed

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const listings = await prisma.listing.findMany({
        orderBy: { createdAt: 'desc' },
      })
      res.status(200).json(listings)
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'Failed to fetch listings' })
    }
  } else if (req.method === 'POST') {
    try {
      const {
        userId,
        type,
        title,
        description,
        quantity,
        unit,
        price,
        district,
        contact,
      } = req.body

      const newListing = await prisma.listing.create({
        data: {
          userId,
          type,
          title,
          description,
          quantity,
          unit,
          price,
          district,
          contact,
        },
      })

      res.status(201).json(newListing)
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'Failed to create listing' })
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
