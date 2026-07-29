const db = require('../db/client');

class ReflexionStore {
  constructor(seniorId = null) {
    this.seniorId = seniorId;
  }

  async store(taskType, error, lesson, strategy) {
    try {
      await db.query(
        `INSERT INTO reflexion_lessons (senior_id, task_type, error, lesson, strategy)
         VALUES ($1, $2, $3, $4, $5)`,
        [this.seniorId, taskType, error, lesson, strategy]
      );
      console.log(`REFLEXION: Stored lesson for ${taskType}`);
    } catch (err) {
      console.error('Reflexion store error:', err.message);
    }
  }

  async getLessons(taskType, limit = 3) {
    try {
      const result = await db.query(
        `SELECT error, lesson, strategy, created_at 
         FROM reflexion_lessons 
         WHERE senior_id = $1 AND task_type = $2
         ORDER BY created_at DESC 
         LIMIT $3`,
        [this.seniorId, taskType, limit]
      );
      return result.rows;
    } catch (err) {
      console.error('Reflexion get error:', err.message);
      return [];
    }
  }

  formatForPrompt(taskType) {
    return this.getLessons(taskType).then(lessons => {
      if (lessons.length === 0) return '';
      const lines = lessons.map((l, i) => `${i + 1}. Error: ${l.error}\n   Lesson: ${l.lesson}\n   Strategy: ${l.strategy}`);
      return `Past lessons learned for this senior:\n${lines.join('\n')}\nApply these strategies to avoid repeating mistakes.`;
    });
  }

  // Detect if a response was poor and store lesson
  async reflectOnResponse(userMessage, aiResponse, followUpUserMessage) {
    const negativeSignals = ['don\'t understand', 'confusing', 'what', 'huh', 'repeat', 'don\'t know what you mean'];
    const lowerFollowUp = followUpUserMessage?.toLowerCase() || '';

    if (negativeSignals.some(s => lowerFollowUp.includes(s))) {
      await this.store(
        'chat_response',
        `User said: "${followUpUserMessage}" after AI said: "${aiResponse}"`,
        'Response was confusing or too complex',
        'Use simpler words, shorter sentences, and confirm understanding'
      );
      console.log('REFLEXION: Detected confusion, stored lesson');
    }
  }
}

module.exports = { ReflexionStore };
