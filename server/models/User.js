import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    name: String,
    credits: { type: Number, default: 2 },
    skillsTeach: [String],
    skillsLearn: [String],
  },
  { timestamps: true }
)

export default mongoose.model('User', userSchema) 