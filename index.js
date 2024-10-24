const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer');


const app = express();
const port = 3000;
const cors = require('cors');

const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(cors());

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(express.json());

const jwt = require('jsonwebtoken');

mongoose
  .connect('mongodb+srv://anuratan:Anuratan%401421@cluster0.0uo5r.mongodb.net/?retryWrites=true&w=majority')
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch(error => {
    console.log('Error connecting to MongoDB', error);
  });

app.listen(port, () => {
  console.log('Server is running on 3000');
});

const User = require('./models/user');
 const Chat = require('./models/message');



// Backend Route to Create User and Generate Token
const bcrypt = require('bcrypt');

// Backend Route to Create User and Hash Password
app.post('/register', async (req, res) => {
  try {
    const { password, ...userData } = req.body;

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate a random encryption key for this user
    const encryptionKey = crypto.randomBytes(32).toString('hex');

    // Create a new user with hashed password and encryption key
    const newUser = new User({ ...userData, password: hashedPassword, encryptionKey });

    await newUser.save();

    // Generate a JWT token
    const token = jwt.sign({ userId: newUser._id }, encryptionKey); // You can use encryptionKey as secret

    res.status(201).json({ token });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// app.get('/user', async (req, res) => {
//   try {
//     // Get the user details based on the user ID from the authentication token
//     const userId = req.user.id; // Assuming the user ID is stored in the request object after authentication
//     const user = await User.findById(userId);

//     if (!user) {
//       return res.status(404).json({message: 'User not found'});
//     }

//     res.status(200).json(user);
//   } catch (error) {
//     console.error('Error fetching user details:', error);
//     res.status(500).json({message: 'Internal server error'});
//   }
// });

//fetch users data
app.get('/users/:userId', async (req, res) => {
  try {
    const {userId} = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(500).json({message: 'User not found'});
    }

    return res.status(200).json({user});
  } catch (error) {
    res.status(500).json({message: 'Error fetching the user details'});
  }
});

//endpoint to login
// Endpoint to login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if the user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Compare the plain password with the hashed password stored in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const secretKey = crypto.randomBytes(32).toString('hex');
    const token = jwt.sign({ userId: user._id }, secretKey);

    return res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Login failed' });
  }
});


app.get('/matches', async (req, res) => {

  try {
    const { userId } = req.query;

 

    // Fetch user's dating preferences and type
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({message: 'User not found'});
    }

    let filter = {}; // Initialize filter as an empty object

    if (user.gender === 'Men') {
      filter.gender = 'Women';
    } else if (user.gender === 'Women') {
      filter.gender = 'Men';
    }

    // Construct query based on dating preferences and type
    let query = {
      _id: {$ne: userId},
    };

    // if (user.datingPreferences && user.datingPreferences.length > 0) {
    //   filter.datingPreferences = user.datingPreferences;
    // }
    if (user.type) {
      filter.type = user.type; // Assuming user.type is a single value
    }

    const currentUser = await User.findById(userId)
      .populate('matches', '_id')
      .populate('likedProfiles', '_id');

    // Extract IDs of friends
    const friendIds = currentUser.matches.map(friend => friend._id);

    // Extract IDs of crushes
    const crushIds = currentUser.likedProfiles.map(crush => crush._id);


    // Fetch matches based on query
    const matches = await User.find(filter)
      .where('_id')
      .nin([userId, ...friendIds, ...crushIds]);

    return res.status(200).json({matches});
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({message: 'Internal server error'});
  }
});

// Endpoint for liking a profile
// POST endpoint to handle liking a profile
app.post('/like-profile', async (req, res) => {
  try {
    const {userId, likedUserId, image, comment} = req.body;

    // Update the liked user's receivedLikes array
    await User.findByIdAndUpdate(likedUserId, {
      $push: {
        receivedLikes: {
          userId: userId,
          image: image,
          comment: comment,
        },
      },
    });
    // Update the user's likedProfiles array
    await User.findByIdAndUpdate(userId, {
      $push: {
        likedProfiles: likedUserId,
      },
    });

    res.status(200).json({message: 'Profile liked successfully'});
  } catch (error) {
    console.error('Error liking profile:', error);
    res.status(500).json({message: 'Internal server error'});
  }
});


app.get('/received-likes/:userId', async (req, res) => {
  try {
    const {userId} = req.params;

    const likes = await User.findById(userId)
      .populate('receivedLikes.userId', 'firstName imageUrls prompts')
      .select('receivedLikes');

    res.status(200).json({receivedLikes: likes.receivedLikes});
  } catch (error) {
    console.error('Error fetching received likes:', error);
    res.status(500).json({message: 'Internal server error'});
  }
});

//endpoint to create a match betweeen two people
app.post('/create-match', async (req, res) => {
  try {
    const {currentUserId, selectedUserId} = req.body;

    //update the selected user's crushes array and the matches array
    await User.findByIdAndUpdate(selectedUserId, {
      $push: {matches: currentUserId},
      $pull: {likedProfiles: currentUserId},
    });

    //update the current user's matches array recievedlikes array
    await User.findByIdAndUpdate(currentUserId, {
      $push: {matches: selectedUserId},
    });

    // Find the user document by ID and update the receivedLikes array
    const updatedUser = await User.findByIdAndUpdate(
      currentUserId,
      {
        $pull: {receivedLikes: {userId: selectedUserId}},
      },
      {new: true},
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
  }


    // If the user document was successfully updated
    res.status(200).json({message: 'ReceivedLikes updated successfully'});

  } catch (error) {
    res.status(500).json({message: 'Error creating a match', error});
  }
});

// Endpoint to get all matches of a specific user
app.get('/get-matches/:userId', async (req, res) => {
  try {
    const {userId} = req.params;

    // Find the user by ID and populate the matches field
    const user = await User.findById(userId).populate(
      'matches',
      'firstName imageUrls',
    );

    if (!user) {
      return res.status(404).json({message: 'User not found'});
    }

    // Extract matches from the user object
    const matches = user.matches;

    res.status(200).json({matches});
  } catch (error) {
    console.error('Error getting matches:', error);
    res.status(500).json({message: 'Internal server error'});
  }
});

io.on('connection', socket => {
 

  socket.on('sendMessage', async data => {
    try {
      const { senderId, receiverId, message, imageUrl } = data;

   

      // Create a new message instance
      const newMessage = new Chat({ senderId, receiverId, message, imageUrl });
      await newMessage.save();

      // Emit the message to the receiver
      socket.to(receiverId).emit('receiveMessage', newMessage);

    } catch (error) {
      console.error('Error handling the message:', error);
    }
  });
});


http.listen(8000, () => {
  console.log('Socket.IO server running on port 8000');
});

app.get('/messages', async (req, res) => {
  try {
    const { senderId, receiverId } = req.query;

    const messages = await Chat.find({
      $or: [
        { senderId: senderId, receiverId: receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    });

    // Decrypt each message
    const decryptedMessages = await Promise.all(
      messages.map(async (message) => {
        const decrypted = await message.decryptMessage();
        return { ...message._doc, message: decrypted }; // Return the decrypted message
      })
    );

    res.status(200).json(decryptedMessages);
  } catch (error) {
    res.status(500).json({ message: 'Error in getting messages', error });
  }
});




app.post('/check-email', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user) {
    return res.json({ exists: true });
  }

  res.json({ exists: false });
});


app.post('/cancel-match', async (req, res) => {
  try {
    const {currentUserId, selectedUserId} = req.body;

    //update the selected user's crushes array and the matches array
    await User.findByIdAndUpdate(selectedUserId, {
     
      $pull: {likedProfiles: currentUserId},
    });

    //update the current user's matches array recievedlikes array
    // await User.findByIdAndUpdate(currentUserId, {
    //   $push: {matches: selectedUserId},
    // });

    // Find the user document by ID and update the receivedLikes array
    const updatedUser = await User.findByIdAndUpdate(
      currentUserId,
      {
        $pull: {receivedLikes: {userId: selectedUserId}},
      },
      {new: true},
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
  }


    // If the user document was successfully updated
    res.status(200).json({message: 'ReceivedLikes updated successfully'});

  } catch (error) {
    res.status(500).json({message: 'Error creating a match', error});
  }
});


app.post('/add-comment', async (req, res) => {
  const { userId, likedUserId, comment } = req.body;

  if (!userId || !likedUserId || !comment) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newComment = new Comment({
      userId,
      likedUserId,
      comment,
    });

    await newComment.save();
    res.status(200).json({ message: 'Comment added successfully' });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET: Fetch comments for a liked user
app.get('/comments/:likedUserId', async (req, res) => {
  const { likedUserId } = req.params;

  try {
    const comments = await Comment.find({ likedUserId }).sort({ timestamp: -1 });
    res.status(200).json({ comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


app.post('/cross-profile', async (req, res) => {
  try {
    const { userId, crossedUserId } = req.body;

    // Add the crossed user's ID to the current user's crossedProfiles array
    await User.findByIdAndUpdate(userId, {
      $push: { crossedProfiles: crossedUserId },
    });

    res.status(200).json({ message: 'Profile crossed successfully' });
  } catch (error) {
    console.error('Error crossing profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
