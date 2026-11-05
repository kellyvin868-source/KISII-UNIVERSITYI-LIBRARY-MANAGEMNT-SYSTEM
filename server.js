require('dotenv').config();
const express=require('express');
const cors=require('cors');

const PORT=process.env.PORT || 4000;
const app=express();


app.use(express.json({limit:"5mb"}));
app.use(cors());


app.listen(PORT,()=>{
    console.log(`API is now listening at port ${PORT}`);
})