import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose-cjs";

dotenv.config();
const dbUri = process.env.MONGODB_URL;

const app = express();
const port = process.env.PORT;
const client = new MongoClient(dbUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`),
);

async function run() {
  try {
    await client.connect();
    await client.db("lifelore").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );

    const database = client.db("lifelore");

    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ message: "Unauthorized" });
      const token = authHeader.split(" ")[1];
      if (!token) return res.status(401).json({ message: "Unauthorized" });
      try {
        const { payload } = await jwtVerify(token, JWKS);
        if (!ObjectId.isValid(payload.sub)) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        const dbUser = await database
          .collection("user")
          .findOne(
            { _id: new ObjectId(payload.sub) },
            { projection: { role: 1 } },
          );
        if (!dbUser) return res.status(401).json({ message: "Unauthorized" });
        req.user = { ...payload, role: dbUser.role };
        next();
      } catch {
        return res.status(403).json({ message: "Forbidden" });
      }
    };

    const requireAdmin = (req, res, next) => {
      if (req.user?.role !== "admin")
        return res.status(403).json({ message: "Forbidden" });
      next();
    };

    app.use(express.json());
    app.use(cors());

    app.get("/", (req, res) => {
      res.send({
        message:
          "Lifelore Backend is an Express.js API for handling lesson management and user interactions. It is built to support a modern React/Next.js client and connects to MongoDB for data storage.",
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
      const { sort } = req.query;

      try {
        const query = { favouritesCount: { $gt: 0 } };

        const cursor = database.collection("lessons").find(query).limit(5);

        if (sort) {
          cursor.sort({
            favouritesCount: sort === "desc" ? -1 : 1,
          });
        }

        const lessons = await cursor.toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/count", async (req, res) => {
      const lessonCount = await database
        .collection("lessons")
        .countDocuments({ visibility: "public" });
      res.json(lessonCount);
    });

    app.patch("/api/lessons/favourite", verifyToken, async (req, res) => {
      const { userId, lessonId } = req.body;

      try {
        const lesson = await database.collection("lessons").findOne({
          _id: new ObjectId(lessonId),
        });

        if (!lesson) {
          return res.status(404).json({ message: "Lesson not found" });
        }

        const isFavourite = lesson.favourites?.includes(userId);

        const result = await database.collection("lessons").updateOne(
          { _id: new ObjectId(lessonId) },
          isFavourite
            ? {
                $pull: { favourites: userId },
              }
            : {
                $addToSet: { favourites: userId },
              },
        );

        res.status(200).json({
          message: isFavourite
            ? "Removed from favourites"
            : "Added to favourites",
        });
      } catch (error) {
        console.error("Error updating favourites:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
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
        const {
          search,
          category,
          tone,
          sort = "newest",
          page = 1,
          limit = 6,
        } = req.query;

        const pageNum = Math.max(parseInt(page), 1);
        const limitNum = Math.max(parseInt(limit), 1);
        const skip = (pageNum - 1) * limitNum;

        const matchStage = {
          visibility: { $regex: /^public$/i },
        };

        if (category) {
          matchStage.category = {
            $regex: `^${category.trim()}$`,
            $options: "i",
          };
        }

        if (tone) {
          matchStage.emotionalTone = {
            $regex: `^${tone.trim()}$`,
            $options: "i",
          };
        }

        if (search) {
          matchStage.$or = [
            { title: { $regex: search.trim(), $options: "i" } },
            { keywords: { $regex: search.trim(), $options: "i" } },
          ];
        }

        let sortStage = {};

        switch (sort) {
          case "most_saved":
            sortStage = { favouritesCount: -1, createdAt: -1 };
            break;
          case "newest":
          default:
            sortStage = { createdAt: -1 };
            break;
        }

        const collection = database.collection("lessons");

        const pipeline = [
          { $match: matchStage },
          { $sort: sortStage },
          { $skip: skip },
          { $limit: limitNum },
        ];

        const countPipeline = [{ $match: matchStage }, { $count: "total" }];

        const [data, countResult] = await Promise.all([
          collection.aggregate(pipeline, { allowDiskUse: true }).toArray(),
          collection.aggregate(countPipeline).toArray(),
        ]);

        const total = countResult[0]?.total || 0;

        res.json({
          data,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
          },
        });
      } catch (error) {
        console.error("Error fetching public lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.post("/api/lessons/like", verifyToken, async (req, res) => {
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

    app.post("/api/lessons/favourite", verifyToken, async (req, res) => {
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

    app.get(
      "/api/admin/overview",
      verifyToken,
      requireAdmin,
      async (req, res) => {
        try {
          const totalPublicLessons = await database
            .collection("lessons")
            .countDocuments({ visibility: "Public" });
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
      },
    );

    app.get(
      "/api/admin/lessons",
      verifyToken,
      requireAdmin,
      async (req, res) => {
        const publicLessonCount = await database
          .collection("lessons")
          .countDocuments({ visibility: "Public" });
        const privateLessonCount = await database
          .collection("lessons")
          .countDocuments({ visibility: "Private" });
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
        const allLessons = await database
          .collection("lessons")
          .find()
          .toArray();

        res.json({
          publicLessonCount: publicLessonCount,
          privateLessonCount: privateLessonCount,
          reportedLessonCount:
            reportedLessonCount.length > 0
              ? reportedLessonCount[0].reportedLessonCount
              : 0,
          allLessons: allLessons,
        });
      },
    );

    app.patch(
      "/api/admin/lessons/:id",
      verifyToken,
      requireAdmin,
      async (req, res) => {
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

          const isOwner = lesson.creatorId === req.user.sub;
          const isAdmin = req.user.role === "admin";

          if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: "Forbidden" });
          }

          const updates = Object.fromEntries(
            Object.entries(req.body).filter(
              ([_, value]) => value !== undefined,
            ),
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
      },
    );

    app.get(
      "/api/lessons/report",
      verifyToken,
      requireAdmin,
      async (req, res) => {
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
      },
    );

    app.patch("/api/lessons/visibility/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { visibility } = req.body;

      try {
        const lesson = await database.collection("lessons").findOne({
          _id: new ObjectId(id),
        });

        if (!lesson) {
          return res.status(404).json({
            message: "Lesson not found",
          });
        }

        const isOwner = lesson.creatorId === req.user.sub;
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isAdmin) {
          return res.status(403).json({ message: "Forbidden" });
        }

        const result = await database.collection("lessons").updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { visibility },
          },
        );

        return res.status(200).json({
          message: "Lesson visibility updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating lesson visibility:", error);
        return res.status(500).json({
          message: "Internal Server Error",
        });
      }
    });

    app.patch("/api/lessons/accessLevel/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { accessLevel } = req.body;

      try {
        const lesson = await database.collection("lessons").findOne({
          _id: new ObjectId(id),
        });

        if (!lesson) {
          return res.status(404).json({
            message: "Lesson not found",
          });
        }

        const isOwner = lesson.creatorId === req.user.sub;
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isAdmin) {
          return res.status(403).json({ message: "Forbidden" });
        }

        const result = await database.collection("lessons").updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { accessLevel },
          },
        );

        return res.status(200).json({
          message: "Lesson access level updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating lesson access level:", error);
        return res.status(500).json({
          message: "Internal Server Error",
        });
      }
    });

    app.get(
      "/api/lessons/report/:lessonId",
      verifyToken,
      requireAdmin,
      async (req, res) => {
        try {
          const { lessonId } = req.params;

          const reports = await database
            .collection("lessonReports")
            .aggregate([
              {
                $match: {
                  lessonId: lessonId,
                },
              },
              {
                $addFields: {
                  userObjId: {
                    $convert: {
                      input: "$userId",
                      to: "objectId",
                      onError: null,
                    },
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
              {
                $lookup: {
                  from: "user",
                  localField: "userObjId",
                  foreignField: "_id",
                  as: "userInfo",
                },
              },
              {
                $lookup: {
                  from: "lessons",
                  localField: "lessonObjId",
                  foreignField: "_id",
                  as: "lessonInfo",
                },
              },
              {
                $addFields: {
                  userInfo: { $first: "$userInfo" },
                  lessonInfo: { $first: "$lessonInfo" },
                },
              },
              {
                $project: {
                  userObjId: 0,
                  lessonObjId: 0,
                  "userInfo.password": 0,
                  "userInfo.salt": 0,
                },
              },
            ])
            .toArray();
          res.json(reports);
        } catch (error) {
          console.error("Error fetching lesson reports:", error);
          res.status(500).json({ message: "Internal Server Error" });
        }
      },
    );

    app.delete(
      "/api/lessons/report/:lessonId",
      verifyToken,
      requireAdmin,
      async (req, res) => {
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
      },
    );

    app.post("/api/lessons/report", verifyToken, async (req, res) => {
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

    app.post("/api/lessons/comments", verifyToken, async (req, res) => {
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
                userName: { $arrayElemAt: ["$user?.name", 0] },
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

    app.delete(
      "/api/lessons/comments/:commentId",
      verifyToken,
      async (req, res) => {
        try {
          const { commentId } = req.params;
          const result = await database
            .collection("comments")
            .deleteOne({ _id: new ObjectId(commentId) });
          if (!result.deletedCount) {
            return res.status(404).json({ message: "Comment not found" });
          }
          res.json({ message: "Comment deleted successfully" });
        } catch (error) {
          console.error("Error deleting comment:", error);
          res.status(500).json({ message: "Internal Server Error" });
        }
      },
    );

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

    app.delete("/api/lessons/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

        const lesson = await database
          .collection("lessons")
          .findOne({ _id: new ObjectId(id) });

        if (!lesson) {
          return res.status(404).json({ message: "Lesson not found" });
        }

        const isOwner = lesson.creatorId === req.user.sub;
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isAdmin) {
          return res.status(403).json({ message: "Forbidden" });
        }

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

    app.post("/api/lessons", verifyToken, async (req, res) => {
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
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/users", verifyToken, requireAdmin, async (req, res) => {
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
          {
            $match: {
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

    app.get("/api/users/count", verifyToken, requireAdmin, async (req, res) => {
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

    app.delete(
      "/api/users/:id",
      verifyToken,
      requireAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const result = await database
            .collection("user")
            .deleteOne({ _id: new ObjectId(id) });
          if (result.deletedCount === 0) {
            return res.status(404).json({ message: "User not found" });
          }
          // Immediately invalidate all sessions and OAuth accounts
          await database.collection("session").deleteMany({ userId: id });
          await database.collection("account").deleteMany({ userId: id });
          return res.status(200).json({ message: "User deleted successfully" });
        } catch (error) {
          console.error("Error deleting user:", error);
          return res.status(500).json({ message: "Internal Server Error" });
        }
      },
    );

    app.patch("/api/users/:id", verifyToken, requireAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const updates = req.body;

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
      console.log(`Listening on port ${port}`);
    });
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);
