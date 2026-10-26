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
      required: true,
      unique: true
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
      default: false,
      required : true
    },

    isBanned: {
      type: Boolean,
      default: false,
      required : true
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