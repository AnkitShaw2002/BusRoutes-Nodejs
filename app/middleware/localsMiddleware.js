// // app/middleware/localsMiddleware.js
// const Message = require('../models/Message');

// const setGlobalLocals = async (req, res, next) => {
//     res.locals.messages = {
//         success: req.flash('success'),
//         error: req.flash('error')
//     };
//     res.locals.currentUser = req.user || null;
//     res.locals.unreadCount = req.user ? (req.user.notifications || []).filter(n => !n.isRead).length : 0;

//     res.locals.unreadMessagesCount = 0;
//     if (req.user) {
//         try {
//             res.locals.unreadMessagesCount = await Message.countDocuments({
//                 receiverId: req.user._id,
//                 isRead: false
//             });
//         } catch (error) {
//             console.error('Error counting unread messages:', error);
//         }
//     }
//     next();
// };

// module.exports = setGlobalLocals;