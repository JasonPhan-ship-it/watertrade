import { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// Ensure only authenticated users can modify data
const requireAuth = (req: NextApiRequest) => {
  const { userId } = getAuth(req);
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = req.method;

  try {
    if (method === "GET") {
      const listings = await prisma.listing.findMany({
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json(listings);
    }

    if (method === "POST") {
      const userId = requireAuth(req);
      const {
        type,
        title,
        description,
        quantity,
        unit,
        price,
        district,
        contact,
      } = req.body;

      const listing = await prisma.listing.create({
        data: {
          type,
          title,
          description,
          quantity,
          unit,
          price,
          district,
          contact,
          userId,
        },
      });

      return res.status(201).json(listing);
    }

    if (method === "PUT") {
      const userId = requireAuth(req);
      const { id, ...data } = req.body;

      const existing = await prisma.listing.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updated = await prisma.listing.update({
        where: { id },
        data,
      });

      return res.status(200).json(updated);
    }

    if (method === "DELETE") {
      const userId = requireAuth(req);
      const { id } = req.body;

      const existing = await prisma.listing.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await prisma.listing.delete({ where: { id } });
      return res.status(204).end();
    }

    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    res.status(405).end(`Method ${method} Not Allowed`);
  } catch (error: any) {
    console.error("[LISTING_API_ERROR]", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}

