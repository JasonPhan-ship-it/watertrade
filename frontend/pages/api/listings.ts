// frontend/pages/api/listings.ts
import { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Handle GET request
    res.status(200).json({ message: 'GET Listings' })
  } else if (req.method === 'POST') {
    // Handle POST request
    res.status(201).json({ message: 'Created Listing' })
  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
