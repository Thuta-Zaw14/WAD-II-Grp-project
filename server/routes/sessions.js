import express from 'express';
import Sessions from '../models/Sessions';

const router = express.Router();

router.post('/session', async (req,res) => {
    const data = req.body.data;

})