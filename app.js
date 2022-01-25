const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Error Message:${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const userExists = `
    SELECT
        *
    FROM
        user
    WHERE
        username='${username}';
    `;
  const user = await db.get(userExists);

  if (user === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 13);
      const addUser = `
            INSERT INTO
                user(username,name,password,gender)
            VALUES
                (
                    '${username}',
                    '${name}',
                    '${hashedPassword}',
                    '${gender}'
                );
            `;
      await db.run(addUser);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userData = `
    select
        *
    from
        user
    where
     username='${username}';
    `;
  const user = await db.get(userData);

  if (user !== undefined) {
    const validateUser = await bcrypt.compare(password, user.password);
    if (validateUser) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authenticateJWT = (request, response, next) => {
  let jwtToken;
  const { authorization } = request.headers;
  if (authorization !== undefined) {
    jwtToken = authorization.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
  if (jwtToken !== undefined) {
    const correctToken = jwt.verify(
      jwtToken,
      "SECRET",
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      }
    );
  }
};

app.get("/user/tweets/feed/", authenticateJWT, async (request, response) => {
  const { username } = request;

  const userId = `
    select
        user_id
    from
        user
    where
        username='${username}';
    `;
  const userNo = (await db.get(userId)).user_id;
  const tweetsList = `
    select
        user.username,tweet.tweet,tweet.date_time as dateTime
    from
        tweet join follower on follower.following_user_id=tweet.user_id
        join user on user.user_id=follower.following_user_id
    where
        follower.follower_user_id='${userNo}'
    order by
        tweet.date_time desc
    limit 4;
    `;
  const tweets = await db.all(tweetsList);
  response.send(tweets);
});

app.get("/user/following/", authenticateJWT, async (request, response) => {
  const { username } = request;

  const userId = `
    select
        user_id
    from
        user
    where
        username='${username}';
    `;
  const getUserId = (await db.get(userId)).user_id;
  const userList = `
    select
        user.name as name
    from
        follower join user on user.user_id=follower.following_user_id
    where
        follower.follower_user_id='${getUserId}';
    `;
  const users = await db.all(userList);
  response.send(users);
});

app.get("/user/followers/", authenticateJWT, async (request, response) => {
  const { username } = request;

  const userId = `
    select
        user_id
    from
        user
    where
        username='${username}';
    `;
  const getUserId = (await db.get(userId)).user_id;
  const userList = `
    select
        user.name as name
    from
        follower join user on user.user_id=follower.follower_user_id
    where
        follower.following_user_id='${getUserId}';
    `;
  const users = await db.all(userList);
  response.send(users);
});

app.get("/tweets/:tweetId/", authenticateJWT, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const tweetIds = `
    select
        tweet.tweet_id
    from
        (user join follower on user.user_id=follower.follower_user_id) as T
        join tweet on T.following_user_id=tweet.user_id
    where
        user.username='${username}';
    `;
  const getTweetId = await db.all(tweetIds);
  const tweetIdArray = getTweetId.map((eachTweet) => {
    return eachTweet.tweet_id;
  });

  if (tweetIdArray.includes(parseInt(tweetId))) {
    const tweet = `
        select
            tweet.tweet,
            count(distinct(like.like_id)) as likes,
            count(distinct(reply.reply_id)) as replies,
            date_time as dateTime
        from
            tweet join reply on reply.tweet_id=tweet.tweet_id
            join like on tweet.tweet_id=like.tweet_id
        where
            tweet.tweet_id=${tweetId};
        `;
    const getTweet = await db.get(tweet);
    response.send(getTweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateJWT,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const tweetIds = `
    select
        tweet.tweet_id
    from
        (user join follower on user.user_id=follower.follower_user_id) as T
        join tweet on T.following_user_id=tweet.user_id
    where
        user.username='${username}';
    `;
    const getTweetId = await db.all(tweetIds);
    const tweetIdArray = getTweetId.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (tweetIdArray.includes(parseInt(tweetId))) {
      const likedUsers = `
        select
            user.username
        from
            tweet join like on tweet.tweet_id=like.tweet_id
            join user on user.user_id=like.user_id
        where
            tweet.tweet_id=${tweetId};
        `;
      const getLikedUsers = await db.all(likedUsers);
      const usersArray = getLikedUsers.map((eachUser) => {
        return eachUser.username;
      });
      response.send({ likes: usersArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateJWT,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const tweetIds = `
    select
        tweet.tweet_id
    from
        (user join follower on user.user_id=follower.follower_user_id) as T
        join tweet on T.following_user_id=tweet.user_id
    where
        user.username='${username}';
    `;
    const getTweetId = await db.all(tweetIds);
    const tweetIdArray = getTweetId.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (tweetIdArray.includes(parseInt(tweetId))) {
      const repliesUsers = `
        select
            user.name,reply.reply
        from
            tweet join reply on tweet.tweet_id=reply.tweet_id
            join user on user.user_id=reply.user_id
        where
            tweet.tweet_id=${tweetId};
        `;
      const getRepliedUsers = await db.all(repliesUsers);
      response.send({ replies: getRepliedUsers });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateJWT, async (request, response) => {
  const { username } = request;

  const tweetIds = `
    select
        tweet.tweet_id
    from
        user join tweet on user.user_id=tweet.user_id
    where
        user.username='${username}';
    `;
  const getTweetId = await db.all(tweetIds);
  const tweetIdArray = getTweetId.map((eachTweet) => {
    return eachTweet.tweet_id;
  });
  const tweet = `
    select
        tweet.tweet,
        count(distinct(like.like_id)) as likes,
        count(distinct(reply.reply_id)) as replies,
        date_time as dateTime
    from
        tweet join reply on reply.tweet_id=tweet.tweet_id
        join like on tweet.tweet_id=like.tweet_id
    where
        tweet.tweet_id in (${tweetIdArray})
    group by tweet.tweet_id;
    `;
  const getTweet = await db.all(tweet);
  response.send(getTweet);
});

app.post("/user/tweets/", authenticateJWT, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const userId = `
    select
        user_id
    from
        user
    where
        username='${username}';
    `;
  const objectUserId = await db.get(userId);
  const getUserId = objectUserId.user_id;
  const currentDate = new Date();
  const date = currentDate.toISOString().replace("T", " ");
  console.log(date);
  const addTweet = `
    insert into
        tweet(tweet,user_id,date_time)
    values
        (
            '${tweet}',
            ${getUserId},
            '${date}'
        );
    `;
  await db.run(addTweet);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticateJWT, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const tweetIds = `
    select
        tweet.tweet_id
    from
        user join tweet on tweet.user_id=user.user_id
    where
        user.username='${username}';
    `;
  const getTweetId = await db.all(tweetIds);
  const tweetIdArray = getTweetId.map((eachTweet) => {
    return eachTweet.tweet_id;
  });
  console.log(tweetIdArray);

  if (tweetIdArray.includes(parseInt(tweetId))) {
    const deleteTweet = `
      delete from
        tweet
      where
        tweet_id=${tweetId};
      `;
    await db.run(deleteTweet);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
