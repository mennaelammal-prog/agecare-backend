const db = require('../db/client');

class KnowledgeGraph {
  constructor(seniorId) {
    this.seniorId = seniorId;
  }

  async addEntity(label, name, properties = {}) {
    try {
      await db.query(
        `INSERT INTO kg_entities (senior_id, label, name, properties)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (senior_id, label, name) DO UPDATE SET properties = $4`,
        [this.seniorId, label, name, JSON.stringify(properties)]
      );
    } catch (err) {
      console.error('KG addEntity error:', err.message);
    }
  }

  async addRelation(source, predicate, target) {
    try {
      await db.query(
        `INSERT INTO kg_relations (senior_id, source_name, predicate, target_name)
         VALUES ($1, $2, $3, $4)`,
        [this.seniorId, source, predicate, target]
      );
    } catch (err) {
      console.error('KG addRelation error:', err.message);
    }
  }

  async getFacts() {
    try {
      const entities = await db.query(
        `SELECT label, name, properties FROM kg_entities WHERE senior_id = $1`,
        [this.seniorId]
      );
      const relations = await db.query(
        `SELECT source_name, predicate, target_name FROM kg_relations WHERE senior_id = $1`,
        [this.seniorId]
      );
      return {
        entities: entities.rows,
        relations: relations.rows
      };
    } catch (err) {
      console.error('KG getFacts error:', err.message);
      return { entities: [], relations: [] };
    }
  }

  async extractFromConversation(messages) {
    const conversation = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = `Extract key facts about this senior from the conversation.
Output ONLY valid JSON array of entities and relations:
{
  "entities": [
    {"label": "medication", "name": "Aspirin", "properties": {"dosage": "81mg"}},
    {"label": "person", "name": "Dr. Smith", "properties": {"role": "doctor"}}
  ],
  "relations": [
    {"source": "Betty", "predicate": "TAKES", "target": "Aspirin"},
    {"source": "Betty", "predicate": "SEES", "target": "Dr. Smith"}
  ]
}

Conversation:
${conversation}`;

    try {
      const axios = require('axios');
      const result = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-sonnet-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }, {
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
      });

      let text = result.data.content.find(c => c.type === 'text')?.text || '{}';
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const extracted = JSON.parse(text);

      for (const e of extracted.entities || []) {
        await this.addEntity(e.label, e.name, e.properties);
      }
      for (const r of extracted.relations || []) {
        await this.addRelation(r.source, r.predicate, r.target);
      }
      console.log(`KG: Extracted ${extracted.entities?.length || 0} entities, ${extracted.relations?.length || 0} relations`);
    } catch (err) {
      console.error('KG extract error:', err.message);
    }
  }

  formatForPrompt() {
    return this.getFacts().then(facts => {
      const entityLines = facts.entities.map(e => `- ${e.name} (${e.label}): ${JSON.stringify(e.properties)}`);
      const relationLines = facts.relations.map(r => `- ${r.source_name} ${r.predicate} ${r.target_name}`);
      return `Known facts about this senior:\n${entityLines.join('\n')}\n\nRelationships:\n${relationLines.join('\n')}`;
    });
  }
}

module.exports = { KnowledgeGraph };
