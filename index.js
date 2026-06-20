const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const dotenv = require("dotenv");
const { ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { includes } = require("better-auth");

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

    // admin validation
    app.get("/api/lessons/count", async (req, res) => {
      const lessonCount = await database
        .collection("lessons")
        .countDocuments({ visibility: "public" });
      res.json(lessonCount);
    });

    app.get("/api/lessons/favourite/:userId", async (req, res) => {
      const { userId } = req.params;
      try {
        const lessons = await database
          .collection("lessons")
          .find({ favourites: { $in: [userId] } })
          .toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching favourite lessons:", error);
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

    app.get("/api/admin/overview", async (req, res) => {
      try {
        const totalPublicLessons = await database
          .collection("lessons")
          .countDocuments({ visibility: "public" });
        const totalUsers = await database.collection("user").countDocuments();
        const totalReportedLessons = await database
          .collection("lessonReports")
          .countDocuments();
        const mostActiveUsers = await database
          .collection("user")
          .aggregate([
            {
              $addFields: {
                userIdString: { $toString: "$_id" },
              },
            },
            {
              $lookup: {
                from: "lessons",
                localField: "userIdString",
                foreignField: "creatorId",
                as: "createdLessons",
              },
            },
            {
              $addFields: {
                lessonCount: { $size: "$createdLessons" },
              },
            },
            {
              $sort: { lessonCount: -1 },
            },
            {
              $project: {
                createdLessons: 0,
              },
            },
            {
              $limit: 3,
            },
          ])
          .toArray();

        const todaysLesson = await database
          .collection("lessons")
          .countDocuments({
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              $lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          });

        const userGrowthData = await database
          .collection("user")
          .aggregate([
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt",
                  },
                },
                users: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                _id: 0,
                date: "$_id",
                users: 1,
              },
            },
          ])
          .toArray();

        const lessonGrowthData = await database
          .collection("lessons")
          .aggregate([
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt",
                  },
                },
                lessons: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            {
              $project: {
                _id: 0,
                date: "$_id",
                lessons: 1,
              },
            },
          ])
          .toArray();

        res.json({
          totalPublicLessons,
          totalUsers,
          totalReportedLessons,
          todaysLesson,
          mostActiveUsers,
          userGrowthData,
          lessonGrowthData,
        });
      } catch (error) {
        console.error("Error fetching admin overview:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/admin/lessons", async (req, res) => {
      const publicLessonCount = await database
        .collection("lessons")
        .countDocuments({ visibility: "public" });
      const privateLessonCount = await database
        .collection("lessons")
        .countDocuments({ visibility: "private" });
      const reportedLessonCount = await database
        .collection("lessonReports")
        .aggregate([
          {
            $group: {
              _id: "$lessonId",
            },
          },
          {
            $count: "reportedLessonCount",
          },
        ])
        .toArray();
      const allLessons = await database.collection("lessons").find().toArray();

      res.json({
        publicLessonCount: publicLessonCount,
        privateLessonCount: privateLessonCount,
        reportedLessonCount:
          reportedLessonCount.length > 0
            ? reportedLessonCount[0].reportedLessonCount
            : 0,
        allLessons: allLessons,
      });
    });

    app.patch("/api/admin/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const lesson = await database.collection("lessons").findOne({
          _id: new ObjectId(id),
        });

        if (!lesson) {
          return res.status(404).json({
            message: "Lesson not found",
          });
        }

        const updates = Object.fromEntries(
          Object.entries(req.body).filter(([_, value]) => value !== undefined),
        );

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            message: "No valid fields provided",
          });
        }

        const result = await database.collection("lessons").updateOne(
          { _id: new ObjectId(id) },
          {
            $set: updates,
          },
        );

        return res.status(200).json({
          message: "Lesson updated successfully",
          updatedFields: updates,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating lesson:", error);

        return res.status(500).json({
          message: "Internal Server Error",
        });
      }
    });

    app.get("/api/lessons/report", async (req, res) => {
      try {
        const reports = await database
          .collection("lessonReports")
          .aggregate([
            {
              $addFields: {
                lessonIdObject: {
                  $toObjectId: "$lessonId",
                },
                userIdObject: {
                  $toObjectId: "$userId",
                },
              },
            },
            {
              $lookup: {
                from: "lessons",
                localField: "lessonIdObject",
                foreignField: "_id",
                as: "lessons",
              },
            },
            {
              $lookup: {
                from: "user",
                localField: "userIdObject",
                foreignField: "_id",
                as: "user",
              },
            },
            {
              $addFields: {
                lesson: {
                  $arrayElemAt: ["$lessons", 0],
                },
                user: {
                  $arrayElemAt: ["$user", 0],
                },
              },
            },
            {
              $project: {
                lessonIdObject: 0,
                userIdObject: 0,
              },
            },
          ])
          .toArray();
        res.json(reports);
      } catch (error) {
        console.error("Error fetching lesson reports:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/report/:lessonId", async (req, res) => {
      try {
        const { lessonId } = req.params;

        const reports = await database
          .collection("lessonReports")
          .aggregate([
            // 1. Get all reports for this specific lesson
            {
              $match: {
                lessonId: lessonId,
              },
            },
            // 2. Safely cast both userId string and lessonId string to ObjectIds
            {
              $addFields: {
                userObjId: {
                  $convert: { input: "$userId", to: "objectId", onError: null },
                },
                lessonObjId: {
                  $convert: {
                    input: "$lessonId",
                    to: "objectId",
                    onError: null,
                  },
                },
              },
            },
            // 3. Lookup the reporting user details
            {
              $lookup: {
                from: "user", // Change to "users" if your collection is plural
                localField: "userObjId",
                foreignField: "_id",
                as: "userInfo",
              },
            },
            // 4. Lookup the target lesson details
            {
              $lookup: {
                from: "lessons", // Change to match your actual lessons collection name
                localField: "lessonObjId",
                foreignField: "_id",
                as: "lessonInfo",
              },
            },
            // 5. Flatten both arrays into clean single objects
            {
              $addFields: {
                userInfo: { $first: "$userInfo" },
                lessonInfo: { $first: "$lessonInfo" },
              },
            },
            // 6. Secure response data and clean temporary fields
            {
              $project: {
                userObjId: 0,
                lessonObjId: 0,
                "userInfo.password": 0, // Strip out credentials for safety
                "userInfo.salt": 0,
              },
            },
          ])
          .toArray();
        console.log(reports);
        res.json(reports);
      } catch (error) {
        console.error("Error fetching lesson reports:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.delete("/api/lessons/report/:lessonId", async (req, res) => {
      try {
        const { lessonId } = req.params;
        const result = await database
          .collection("lessonReports")
          .deleteMany({ lessonId });
        res.json({ message: "Lesson reports deleted successfully" });
      } catch (error) {
        console.error("Error deleting lesson reports:", error);
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

    app.post("/api/lessons/comments", async (req, res) => {
      try {
        const { lessonId, userId, text } = req.body;
        const comment = {
          lessonId,
          userId,
          text,
          createdAt: new Date(),
        };
        const result = await database.collection("comments").insertOne(comment);
        res
          .status(201)
          .json({ success: true, insertedId: result.insertedId, comment });
      } catch (error) {
        console.error("Error creating comment:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/comments/:lessonId", async (req, res) => {
      try {
        const { lessonId } = req.params;
        const comments = await database
          .collection("comments")
          .aggregate([
            {
              $addFields: {
                userObjectId: {
                  $toObjectId: "$userId",
                },
              },
            },
            {
              $lookup: {
                from: "user",
                localField: "userObjectId",
                foreignField: "_id",
                as: "user",
              },
            },
            {
              $addFields: {
                userName: { $arrayElemAt: ["$user.name", 0] },
                userImage: { $arrayElemAt: ["$user.image", 0] },
              },
            },
            {
              $match: {
                lessonId: lessonId,
              },
            },
            {
              $project: {
                _id: 1,
                userId: 1,
                lessonId: 1,
                text: 1,
                createdAt: 1,
                userName: 1,
                userImage: 1,
              },
            },
          ])
          .sort({ createdAt: -1 })
          .toArray();
        res.json(comments);
      } catch (error) {
        console.error("Error fetching comments:", error);
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

    app.delete("/api/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;
        console.log("delete", id);
        const result = await database
          .collection("lessons")
          .deleteOne({ _id: new ObjectId(id) });
        const deleteLessonReportsResult = await database
          .collection("lessonReports")
          .deleteMany({ lessonId: id });
        res.json({
          message: "Lesson deleted successfully",
          deleteLessonReportsResult,
        });
      } catch (error) {
        console.error("Error deleting lesson:", error);
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
            $addFields: {
              totalLessons: {
                $size: "$lessons",
              },
            },
          },
          {
            $project: {
              lessons: 0,
            },
          },
        ])
        .sort({ totalLessons: -1 })
        .toArray();
      res.json(usersWithLessonCount);
    });

    // admin validation
    app.get("/api/users/count", async (req, res) => {
      try {
        const count = await database.collection("user").countDocuments();
        res.json(count);
      } catch (error) {
        console.error("Error fetching user count:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/users/:id", async (req, res) => {
      const { id } = await req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const user = await database
        .collection("user")
        .aggregate([
          {
            $match: {
              _id: new ObjectId(id),
            },
          },
          {
            $addFields: {
              userIdString: {
                $toString: "$_id",
              },
            },
          },
          {
            $lookup: {
              from: "lessons",
              localField: "userIdString",
              foreignField: "creatorId",
              as: "lessons",
            },
          },
        ])
        .toArray();
      res.json(user[0]);
    });

    app.delete("/api/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await database
          .collection("user")
          .deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({ message: "User deleted successfully" });
      } catch (error) {
        console.error("Error deleting user:", error);
        return res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.patch("/api/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;

        // remove undefined fields (critical fix)
        const setData = Object.fromEntries(
          Object.entries(updates).filter(([_, value]) => value !== undefined),
        );

        if (Object.keys(setData).length === 0) {
          return res.status(400).json({ message: "No valid fields provided" });
        }

        const result = await database
          .collection("user")
          .updateOne({ _id: new ObjectId(id) }, { $set: setData });

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
          message: "User updated successfully",
          updatedFields: setData,
        });
      } catch (error) {
        console.error("Error updating user:", error);
        return res.status(500).json({ message: "Internal Server Error" });
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
