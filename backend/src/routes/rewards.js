import { Router } from 'express'
import { pool, query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { claimDailyLogin, ensureRewardsTables, getCobraPoints } from '../services/cobraPoints.js'

const router = Router()

router.get('/daily-login', requireAuth, async (request, response, next) => {
  try {
    await ensureRewardsTables()
    const result = await query(
      `SELECT current_streak, longest_streak, last_claim_date,
              last_claim_date = CURRENT_DATE AS claimed_today
       FROM cobra_daily_login_streaks
       WHERE identity_key = $1`,
      [String(request.user.id)],
    )
    const streak = result.rows[0]
    const claimedToday = Boolean(streak?.claimed_today)
    const currentStreak = Number(streak?.current_streak || 0)
    const nextStreak = claimedToday ? Math.min(currentStreak, 100) : Math.min(currentStreak + 1, 100)
    response.json({
      totalPoints: await getCobraPoints(String(request.user.id)),
      streak: currentStreak,
      longestStreak: Number(streak?.longest_streak || 0),
      claimedToday,
      nextPoints: Math.min(100, 50 + Math.floor(((nextStreak - 1) * 50) / 99)),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/daily-login/claim', requireAuth, async (request, response, next) => {
  try {
    const reward = await claimDailyLogin(String(request.user.id))
    response.json({
      ...reward,
      totalPoints: await getCobraPoints(String(request.user.id)),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/tasks', requireAuth, async (request, response, next) => {
  try {
    await ensureRewardsTables()
    const result = await query(
      `      SELECT t.id, t.title, t.description, t.points, t.task_type, t.platform,
             t.action_url, t.verification, t.proof_label,
             (c.identity_key IS NOT NULL) AS completed,
             s.status AS submission_status,
             s.review_note AS submission_review_note
      FROM cobra_tasks t
      LEFT JOIN cobra_task_completions c
        ON c.task_id = t.id AND c.identity_key = $1
      LEFT JOIN cobra_task_submissions s
        ON s.task_id = t.id AND s.identity_key = $1
      WHERE t.active = TRUE
      ORDER BY t.created_at DESC`,
      [request.user.id],
    )
    response.json({
      totalPoints: await getCobraPoints(request.user.id),
      tasks: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        points: Number(row.points),
        taskType: row.task_type,
        platform: row.platform,
        actionUrl: row.action_url,
        verification: row.verification,
        proofLabel: row.proof_label,
        completed: Boolean(row.completed),
        submissionStatus: row.submission_status,
        submissionReviewNote: row.submission_review_note || '',
      })),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/tasks/:taskId/complete', requireAuth, async (request, response, next) => {
  const client = await pool.connect()
  try {
    await ensureRewardsTables()
    await client.query('BEGIN')
    const taskResult = await client.query(
      'SELECT id, title, points, verification, task_type, platform FROM cobra_tasks WHERE id = $1 AND active = TRUE',
      [request.params.taskId],
    )
    const task = taskResult.rows[0]
    if (!task) {
      await client.query('ROLLBACK')
      return response.status(404).json({ error: 'This task is no longer available.' })
    }

    const proof = String(request.body?.proof || request.query?.proof || '').trim()
    if (proof.length < 3 || proof.length > 500) {
      await client.query('ROLLBACK')
      return response.status(400).json({ error: 'Enter valid proof, such as a link or social username.' })
    }
    if (task.task_type === 'social' && /x|twitter/i.test(String(task.platform || ''))) {
      const username = proof.replace(/^@/, '')
      if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
        await client.query('ROLLBACK')
        return response.status(400).json({ error: 'Enter your X / Twitter username, for example @cobraalpha.' })
      }
    }
    const existingSubmission = await client.query(
      `SELECT status FROM cobra_task_submissions
       WHERE identity_key = $1 AND task_id = $2`,
      [request.user.id, task.id],
    )
    const submissionStatus = existingSubmission.rows[0]?.status
    if (submissionStatus === 'pending' || submissionStatus === 'approved') {
      await client.query('ROLLBACK')
      return response.status(409).json({
        error: submissionStatus === 'approved' ? 'This task is already approved.' : 'Your proof is already waiting for review.',
      })
    }
    await client.query(
      `INSERT INTO cobra_task_submissions (identity_key, task_id, proof, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (identity_key, task_id) DO UPDATE
       SET proof = EXCLUDED.proof, status = 'pending', review_note = '',
           reviewed_at = NULL, created_at = NOW()`,
      [request.user.id, task.id, proof],
    )
    await client.query('COMMIT')
    response.status(202).json({
      submitted: true,
      pending: true,
      totalPoints: await getCobraPoints(request.user.id),
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    next(error)
  } finally {
    client.release()
  }
})

export default router
