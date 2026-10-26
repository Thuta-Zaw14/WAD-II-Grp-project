import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true
    },

    email: {
      type: String,
      required: true
    },

    name: String,

    credits: {
      type: Number,
      default: 2
    },

    skillsTeach: [String],

    skillsLearn: [String],

    isAdmin: {
      type: Boolean,
      default: false
    },

    isBanned: {
      type: Boolean,
      default: false
    },

    numberOfReports: {
      type: Number,
      default: 0
    },

    warningReasons: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
)

export default mongoose.model('User', userSchema) 