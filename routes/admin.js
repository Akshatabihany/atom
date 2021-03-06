const Router = require('express').Router()
const mongodb = require('mongodb')
const ObjectId = mongodb.ObjectId
const bcrypt = require('bcryptjs')
const {adminloginValidation,changePasswordValidation} = require('../validation')

Router.get('/login', (req,res) => {
    res.render('admin/adminlogin',{msg:''})
})

Router.get('/register', (req,res) => {
    res.render('admin/adminregister',{msg:''})
})

Router.post('/register', (req,res) => {
    
    const salt = bcrypt.genSaltSync(10)
    const hashed = bcrypt.hashSync(req.body.password,salt)

    let newData = {
        name:req.body.name,
        email:req.body.email,
        password: hashed
    }

    let db = req.app.locals.db
    let dbo = db.db('atom')

    dbo.collection('admins').insertOne(newData, (dbErr,result) => {
        if(dbErr) return res.render('error')

        console.log('inserted'+result.insertedCount)
        res.status(200).send('Registered!')
    })
})


Router.post('/login', (req,res) => {

    let {error} = adminloginValidation(req.body)
    if(error) return res.status(400).send(error.details[0].message)

    let db = req.app.locals.db
    let dbo = db.db('atom')

    dbo.collection('admins').find({email:req.body.email}).toArray((dbErr,result) => {
        if(dbErr) return res.render('error')

        if(!result.length || !bcrypt.compareSync(req.body.password,result[0].password)) return res.status(400).send('Email/Password is wrong')

        req.session.user = {
            name:result[0].name,
            email:result[0].email,
            id:result[0]._id
        }

        req.session.user.expires = new Date(
            Date.now() + 1000 * 60 * 60 * 2
        )
        res.end()
    })
})

//middleware for authentication
Router.use((req,res,next) => {
    if(req.session.user) next()
    else res.render('admin/adminlogin',{msg:'Please login to continue'})
})

//middleware to prevent caching for better logout
Router.use(function (req, res, next) {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next()
});

Router.get('/dashboard', (req,res) => {
    res.render('admin/admindashboard',{user:req.session.user})
})


Router.get('/changePassword', (req,res) => {
    res.render('admin/adminchangepassword',{user:req.session.user})
})

Router.post('/changePassword',(req,res) => {

    let {error} = changePasswordValidation(req.body)
    if(error) return res.status(400).send(error.details[0].message) 
    
    let db = req.app.locals.db
    let dbo = db.db('atom')
    
    dbo.collection('admins').findOne({_id:new ObjectId(req.session.user.id)},(dbErr,user) => {
        if(dbErr) return res.render('error')
        
        if(!bcrypt.compareSync(req.body.currentPassword,user.password)) return res.status(400).send('Current Password is incorrect')
        
        const salt = bcrypt.genSaltSync(10)
        const hashed = bcrypt.hashSync(req.body.newPassword,salt)
        dbo.collection('admins').updateOne({_id:new ObjectId(req.session.user.id)},{$set:{password:hashed}}, (dbErr,result) => {
            if(dbErr) return res.render('error') 
            
            console.log(result)
            res.send('Password Updated')
        })
    })
})

Router.post('/addEvent',(req,res) => {
    
    req.body.addedBy = req.session.user.name
    let date = new Date().toString().substring(4,15)
    req.body.addedOn = date

    let db = req.app.locals.db
    let dbo = db.db('atom')

    dbo.collection('events').insertOne(req.body,(dbErr,result) => {
        if(dbErr) return res.render('error')
        
        console.log(result.insertedCount)
        res.send({msg:'Info added'})
    })
})

Router.get('/viewEvents', (req,res) => {
    
    let db = req.app.locals.db
    let dbo=db.db('atom')

    dbo.collection('events').find({}).toArray((dbErr,data) => {
        if(dbErr) return res.render('error')

        res.render('admin/adminviewevents',{data,user:req.session.user})
    })
})

Router.get('/viewMembers', (req,res) => {
    
    let db = req.app.locals.db
    let dbo= db.db('atom')

    dbo.collection('users').find({ userType: 1 },{projection:{password:0}}).toArray((dbErr, tdians) => {
        if (dbErr) return res.render('error')
        
        res.render('admin/adminviewmembers',{data:tdians,user:req.session.user})
    })
})

Router.get('/viewUsers', (req,res) => {
    let db = req.app.locals.db
    db.db('atom').collection('users').find({userType:0},{projection:{password:0}}).toArray((dbErr,ntdians) => {
        if(dbErr) return res.render('error')

        res.render('admin/adminviewusers',{data:ntdians,user:req.session.user})
    })
})

Router.post('/delete', (req,res) => {
    let id = req.body.id
    let from = req.query.from
    let coll = `${from}_garbage`
    
    let db = req.app.locals.db
    db.db('atom').collection(from).findOneAndDelete({_id:new ObjectId(id)},(dbErr,deleted) => {
        if(dbErr) return res.render('error')
        
        console.log(deleted.value)

        db.db('atom').collection(coll).insertOne(deleted.value, (error,result) => {
            if(error) return res.render('error')

            console.log(result.insertedCount)
        })
        res.send({msg:'deleted'})
    })
})

Router.post('/promote', (req,res) => {
    let id = req.body.id

    let db = req.app.locals.db
    db.db('atom').collection('users').updateOne({_id:new ObjectId(id)},{$set:{userType:1}},(dbErr,result) => {
        if(dbErr) return res.render('error')
        
        console.log(result.modifiedCount)
        res.send({msg:'promoted'})
    })
})

Router.get('/addTask',(req,res) => {
    
    let db = req.app.locals.db
    let dbo= db.db('atom')

    dbo.collection('users').find({ userType: 1 },{projection:{password:0}}).toArray((dbErr, tdians) => {
        if (dbErr) return res.render('error')
        
        res.render('admin/adminaddtask',{data:tdians,user:req.session.user})
    })
})

Router.post('/addTask',async(req,res) => {
    let {
        title,
        startDate,
        deadline,
        description,
        phases,
        members,
        resources,
        subtasks
    } = req.body

    let project = { title, startDate, deadline, description, phases, members, resources }
    project.addedBy = req.session.user.name
    let date = new Date().toString().substring(4,15)
    project.addedOn = date

    let db = req.app.locals.db
    db.db('atom').collection('tasks').insertOne(project,(dbErr,result) => {
        if(dbErr) return res.render('error')

        console.log('Project: '+result.insertedCount)
        subtasks.forEach(subtask => {
            subtask.project = result.insertedId.toString()
        })

        db.db('atom').collection('subtasks').insertMany(subtasks, (err,output) => {
            if(err) return res.render('error')

            console.log(output.insertedCount)
            res.send({msg:'Task added. Page reloading in 2 seconds'})
        })
    })
})

Router.get('/editEvent',(req,res) => {
    let db = req.app.locals.db

    db.db('atom').collection('events').findOne({_id:new ObjectId(req.query.id)},{projection:{password:0}},(err,event) => {
        if(err) return res.render('error')

        res.render('admin/admineditevent',{event})
    })
})

Router.post('/editEvent',(req,res) => {
    req.body.editedBy = req.session.user.name
    let date = new Date().toString().substring(4,15)
    req.body.editedOn = date
    let db = req.app.locals.db
    let id = req.body.id
    delete req.body.id

    db.db('atom').collection('events').updateOne({_id:new ObjectId(id)},{$set:req.body},(err,result) => {
        if(err) return res.render('error')

        console.log(result)
        res.json({msg:'updated'})
    })
})


Router.all('/logout', (req,res) => {
    req.session.destroy()
    res.render('admin/adminlogin',{msg : 'you have been logged out'})
})

module.exports = Router