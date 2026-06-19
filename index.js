const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const dotenv = require("dotenv");
const { ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();
const dbUri = process.env.MONGODB_URL;

const app = express();
const port = process.env.PORT;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(dbUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// const JWKS = createRemoteJWKSet(
//   new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`),
// );

// const verifyToken = async (req, res, next) => {
//   const authHeader = req?.headers.authorization;
//   if (!authHeader) {
//     return res.status(401).json({ message: "Unauthorized" });
//   }
//   const token = authHeader.split(" ")[1];
//   if (!token) {
//     return res.status(401).json({ message: "Unauthorized" });
//   }

//   try {
//     const { payload } = await jwtVerify(token, JWKS);
//     next();
//   } catch (error) {
//     return res.status(403).json({ message: "Forbidden" });
//   }
// };

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("mediqueue").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );

    const database = client.db("lifelore");

    // app.use(cors);
    app.use(express.json());
    app.use(cors());

    app.get("/", (req, res) => {
      res.send({
        message:
          "MediQueue Backend is an Express.js API for handling user authentication, tutor listings, and booking workflows. It is built to support a modern React/Next.js client and connects to MongoDB for data storage.",
      });
    });

    app.get("/api/lessons", async (req, res) => {
      try {
        const lessons = await database.collection("lessons").find({}).toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/favourite", async (req, res) => {
      const { sort } = req.query || null;
      if (sort) {
        try {
          const lessons = await database
            .collection("lessons")
            .find({ favouritesCount: { $gt: 0 } })
            .sort({
              favouritesCount: sort === "desc" ? -1 : 1,
            })
            .toArray();
          res.json(lessons);
        } catch (error) {
          console.error("Error fetching lessons:", error);
          res.status(500).json({ message: "Internal Server Error" });
        }
      }

      try {
        const lessons = await database
          .collection("lessons")
          .find({ favouritesCount: { $gt: 0 } })

          .toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/featured", async (req, res) => {
      try {
        const featuredLessons = await database
          .collection("lessons")
          .find({ isFeatured: true })
          .sort({ favouritesCount: -1 })
          .limit(6)
          .toArray();
        res.json(featuredLessons);
      } catch (error) {
        console.error("Error fetching featured lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/public", async (req, res) => {
      try {
        const publicLessons = await database
          .collection("lessons")
          .find({ visibility: "public" })
          .toArray();
        res.json(publicLessons);
      } catch (error) {
        console.error("Error fetching public lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/favourite", async (req, res) => {
      try {
        const favouriteLessons = await database
          .collection("lessons")
          .find({ favourites: { $exists: true, $ne: [] } })
          .toArray();
        res.json(favouriteLessons);
      } catch (error) {
        console.error("Error fetching favourite lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.post("/api/lessons/like", async (req, res) => {
      const { lessonId, userId } = req.body;

      try {
        const lesson = await database.collection("lessons").findOne({
          _id: new ObjectId(lessonId),
        });

        if (!lesson) {
          return res.status(404).json({ message: "Lesson not found" });
        }

        const likesCount = lesson.likes?.length || 0;
        const isLiked = lesson.likes?.includes(userId);
        console.log(likesCount, isLiked);

        const result = await database.collection("lessons").updateOne(
          { _id: new ObjectId(lessonId) },
          isLiked
            ? {
                $pull: { likes: userId },
                $set: { likesCount: likesCount - 1 },
              }
            : {
                $addToSet: { likes: userId },
                $set: { likesCount: likesCount + 1 },
              },
        );

        res.status(200).json({
          message: isLiked ? "Removed Like from lesson" : "Liked the lesson",
        });
      } catch (error) {
        console.error("Error updating likes:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.post("/api/lessons/favourite", async (req, res) => {
      const { lessonId, userId } = req.body;

      try {
        const lesson = await database.collection("lessons").findOne({
          _id: new ObjectId(lessonId),
        });

        if (!lesson) {
          return res.status(404).json({ message: "Lesson not found" });
        }

        const favouritesCount = lesson.favourites?.length || 0;
        const isFavourite = lesson.favourites?.includes(userId);

        const result = await database.collection("lessons").updateOne(
          { _id: new ObjectId(lessonId) },
          isFavourite
            ? {
                $pull: { favourites: userId },
                $set: { favouritesCount: favouritesCount - 1 },
              }
            : {
                $addToSet: { favourites: userId },
                $set: { favouritesCount: favouritesCount + 1 },
              },
        );

        res.status(200).json({
          message: isFavourite
            ? "Lesson removed from favourites"
            : "Lesson added to favourites",
        });
      } catch (error) {
        console.error("Error updating favourites:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.post("/api/lessons/report", async (req, res) => {
      try {
        const { lessonId, userId, reason } = req.body;
        const report = await database.collection("lessonReports").insertOne({
          lessonId,
          userId,
          reason,
          createdAt: new Date(),
        });
        res.status(200).json({ message: "Lesson reported successfully" });
      } catch (error) {
        console.error("Error reporting lesson:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const lesson = await database
          .collection("lessons")
          .findOne({ _id: new ObjectId(id) });
        if (!lesson) {
          return res.status(404).json({ message: "Lesson not found" });
        }
        res.json(lesson);
      } catch (error) {
        console.error("Error fetching lesson:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.post("/api/lessons", async (req, res) => {
      try {
        const {
          title,
          description,
          category,
          emotionalTone,
          visibility,
          accessLevel,
          likes = [],
          likesCount = 0,
          isFeatured = false,
          isReviewed = false,
          creatorId,
          creatorName,
        } = req.body;

        const lesson = {
          title,
          description,
          category,
          emotionalTone,
          visibility,
          accessLevel,

          likes,
          likesCount,
          isFeatured,
          isReviewed,
          creatorId,
          creatorName,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await database.collection("lessons").insertOne(lesson);

        res.status(201).json({
          success: true,
          insertedId: result.insertedId,
          lesson,
        });
      } catch (error) {
        console.error("Error creating lesson:", error);

        res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
      }
    });

    app.get("/api/lessons/count/:creatorId", async (req, res) => {
      try {
        const { creatorId } = req.params;
        const count = await database
          .collection("lessons")
          .countDocuments({ creatorId });
        res.json({ count });
      } catch (error) {
        console.error("Error fetching lesson count:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/creator/:creatorId", async (req, res) => {
      try {
        const { creatorId } = req.params;
        const lessons = await database
          .collection("lessons")
          .find({ creatorId })
          .toArray();

        res.json(lessons);
        console.log("backend", lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // fetch all users
    app.get("/api/users", async (req, res) => {
      try {
        const users = await database.collection("user").find({}).toArray();
        res.json(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/usersWithLessonCount", async (req, res) => {
      const usersWithLessonCount = await database
        .collection("user")
        .aggregate([
          {
            $addFields:
              /**
               * newField: The new field name.
               * expression: The new field expression.
               */
              {
                userIdString: {
                  $toString: "$_id",
                },
              },
          },
          {
            $lookup:
              /**
               * from: The target collection.
               * localField: The local join field.
               * foreignField: The target join field.
               * as: The name for the results.
               * pipeline: Optional pipeline to run on the foreign collection.
               * let: Optional variables to use in the pipeline field stages.
               */
              {
                from: "lessons",
                localField: "userIdString",
                foreignField: "creatorId",
                as: "lessons",
              },
          },
          {
            $match:
              /**
               * query: The query in MQL.
               */
              {
                createdAt: {
                  $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
              },
          },
          {
            $project: {
              name: 1,
              email: 1,
              image: 1,
              totalLessons: {
                $size: "$lessons",
              },
            },
          },
          {
            $match: {
              totalLessons: { $gt: 0 },
            },
          },
        ])
        .sort({ totalLessons: -1 })
        .toArray();
      res.json(usersWithLessonCount);
    });

    app.patch("/api/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { isPremium } = req.body;
        console.log(req.params);
        const result = await database
          .collection("user")
          .updateOne({ _id: new ObjectId(id) }, { $set: { isPremium } });
        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: "User updated successfully" });
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

run().catch(console.dir);
