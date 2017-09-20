const f = require('./functions.js')
const con = require('./Connection').getConnection()

exports.findAll = function (req, res) {
  // Return all Posts
  con.query('SELECT designs.id, designs.username, designs.avatar, designs.userid, designs.image, COUNT(likes.postid) AS likes FROM discord_topdesign AS designs LEFT JOIN discord_topdesign_likes AS likes ON designs.id = likes.postid WHERE designs.active = 1 GROUP BY designs.id ORDER BY likes DESC', function (error, results, fields) {
    if (error) throw error
    res.json(results)
  })
}
exports.findAllCurrentMonth = function (req, res) {
  // Return all Posts from current month
  const timeshort = f.timeshort(new Date)
  con.query('SELECT designs.id, designs.username, designs.avatar, designs.userid, designs.image, COUNT(likes.postid) AS likes FROM discord_topdesign AS designs LEFT JOIN discord_topdesign_likes AS likes ON designs.id = likes.postid WHERE designs.active = 1 AND timeshort = ? GROUP BY designs.id ORDER BY likes DESC', [timeshort], function (error, results, fields) {
    if (error) throw error
    res.json(results)
  })
}
exports.findAllMonth = function (req, res) {
  // Return all Posts grouped by month
  con.query('SELECT designs.id, designs.timeshort, designs.username, designs.avatar, designs.userid, designs.image, COUNT(likes.postid) AS likes FROM discord_topdesign AS designs LEFT JOIN discord_topdesign_likes AS likes ON designs.id = likes.postid WHERE designs.active = 1 GROUP BY designs.id ORDER BY designs.timeshort DESC, likes DESC', function (error, results, fields) {
    if (error) throw error
    let grouped = f.groupBy(results, 'timeshort')
    for (let key in grouped) {
      if (grouped.hasOwnProperty(key)) {
        for (let i = 0; i < grouped[key].length; i++) {
          grouped[key][i].winner = false
        }
        grouped[key][0].winner = true
      }
    }
    res.json(grouped)
  })
}
exports.findById = function (req, res) {
  const id = req.params.id
  con.query('SELECT designs.id, designs.timeshort, designs.username, designs.avatar, designs.userid, designs.image, COUNT(likes.postid) AS likes FROM discord_topdesign AS designs LEFT JOIN discord_topdesign_likes AS likes ON designs.id = likes.postid WHERE designs.id = ?', [id], function (error, results, fields) {
    if (error) throw error
    results = results[0]
    if (!results.id) {
      res.json({error: 'No post with ID ' + id})
    } else {
      res.json(results)
    }
  })
}
exports.add = async (req, res) => {
  const body = req.body
  if (!req.body) return res.sendStatus(400)

  const needed = ['username', 'userid', 'avatar', 'content', 'image']
  for (let i = 0; i < needed.length; i++) {
    if (!body.hasOwnProperty(needed[i])) {
      res.status(400)
      res.json({error: 'Proberty ' + needed[i] + ' required'})
      return
    }
  }
  let data = body
  let avatar = await f.imgur(body.avatar)
  let image = await f.imgur(body.image)
  let timeshort = f.timeshort(new Date())
  data.avatar = avatar
  data.image = image
  data.timeshort = timeshort
  con.query('INSERT INTO discord_topdesign SET ?', [data], function (error, results, fields) {
    if (error) throw error
    res.json({action: 'add', postid: results.insertId})
  })
}
exports.changeStatus = async function (req, res) {
  const postid = req.params.id
  con.query('SELECT designs.active, designs.username,  COUNT(likes.postid) AS likes FROM discord_topdesign AS designs LEFT JOIN discord_topdesign_likes AS likes ON designs.id = likes.postid WHERE designs.id = ? GROUP BY designs.id ORDER BY likes DESC', [postid], function (error, results, fields) {
    if (error) throw error
    let post = results[0]
    if (!post) return res.status(404).send('Not found')
    switch (post.active) {
      case 1:
        con.query('UPDATE discord_topdesign SET active = 0 WHERE id = ?', [postid], function (error, results, fields) {
          if (error) throw error
          res.json({
            action: 'deactivate',
            likes: post.likes,
            posted_by: post.username
          })
        })
        break
      case 0:
        con.query('UPDATE discord_topdesign SET active = 1 WHERE id = ?', [postid], function (error, results, fields) {
          if (error) throw error
          res.json({
            action: 'activate',
            likes: post.likes,
            posted_by: post.username
          })
        })
        break
    }
  })
}
exports.delete = function (req, res) {
  const postid = req.params.id

  con.query('DELETE FROM discord_topdesign WHERE id=?', [postid], function (error, results, fields) {
    if (results.affectedRows === 0) return res.status(404).send('Not found')
    res.json({
      action: 'delete'
    })
  })
}
exports.vote = function (req, res) {

  const postid = req.params.postid
  const body = req.body
  if (!body) return res.sendStatus(400)

  const needed = ['userid']
  for (let i = 0; i < needed.length; i++) {
    if (!body.hasOwnProperty(needed[i])) {
      res.status(400)
      res.json({error: 'Proberty ' + needed[i] + ' required'})
      return
    }
  }
  const timeshort = f.timeshort(new Date)
  con.query('SELECT designs.id, designs.username, COUNT(likes.postid) AS likes FROM discord_topdesign AS designs LEFT JOIN discord_topdesign_likes AS likes ON designs.id = likes.postid WHERE designs.active = 1 AND timeshort = ? AND designs.id = ? GROUP BY designs.id ORDER BY likes DESC', [timeshort, postid], function (error, results, fields) {
    if (error) throw error
    let post = results[0]
    if (!post) return res.status(404).send('Not found')
    con.query('DELETE FROM discord_topdesign_likes WHERE postid = ? AND userid = ?', [postid, body.userid], function (error, results, fields) {
      if (error) throw error
      if (results.affectedRows === 0) {
        let data = {
          userid: body.userid,
          postid: postid
        }
        con.query('INSERT INTO discord_topdesign_likes SET ?', [data], function (error, results, fields) {
          if (error) throw error
          res.json({
            action: 'add',
            likes: post.likes + 1,
            posted_by: post.username
          })
        })
      } else {
        res.json({
          action: 'remove',
          likes: post.likes - 1,
          posted_by: post.username
        })
      }
    })
  })
}
exports.voted = function (req, res) {
  const userid = req.params.userid
  con.query('SELECT discord_topdesign.id AS id, discord_topdesign.timeshort AS timeshort FROM discord_topdesign, discord_topdesign_likes WHERE discord_topdesign_likes.postid = discord_topdesign.id AND discord_topdesign_likes.userid = ?', [userid], function (error, results, fields) {
    if (error) throw error
    let grouped = f.groupBy(results, 'timeshort')
    if (!grouped) return res.json({error: 'User hasn\'t voted yet.'})
    res.json(grouped)
  })
}
exports.submissions = function (req, res) {
  const userid = req.params.userid
  con.query('SELECT designs.id, designs.timeshort, designs.username, designs.avatar, designs.userid, designs.image, COUNT(likes.postid) AS likes FROM discord_topdesign AS designs LEFT JOIN discord_topdesign_likes AS likes ON designs.id = likes.postid WHERE designs.userid = ?', [userid], function (error, results, fields) {
    if (error) throw error
    let grouped = f.groupBy(results, 'timeshort')
    if (!grouped) return res.json({error: 'User has no submissions.'})
    res.json(grouped)
  })
}