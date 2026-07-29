const axios = require('axios');

class TriadSafetyChecker {
  constructor() {
    this.emergencyKeywords = ['chest pain', 'heart attack', 'fallen', 'can\'t breathe', 'bleeding', 'unconscious', 'severe pain', 'stroke', 'emergency'];
    this.medicationKeywords = ['medication', 'medicine', 'pill', 'dose', 'forgot', 'missed'];
  }

  async plan(messages) {
    const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
    
    const plan = { steps: [], riskLevel: 'low' };

    if (this.emergencyKeywords.some(k => lastMsg.includes(k))) {
      plan.steps.push({ id: 1, action: 'detect_emergency', status: 'pending' });
      plan.riskLevel = 'critical';
    }

    if (this.medicationKeywords.some(k => lastMsg.includes(k))) {
      plan.steps.push({ id: 2, action: 'verify_medication', status: 'pending' });
      if (plan.riskLevel === 'low') plan.riskLevel = 'medium';
    }

    plan.steps.push({ id: 3, action: 'general_wellness', status: 'pending' });

    return plan;
  }

  async executeStep(step, messages) {
    const lastMsg = messages[messages.length - 1]?.content || '';

    switch (step.action) {
      case 'detect_emergency':
        return {
          alert: true,
          alertType: 'EMERGENCY',
          message: 'URGENT: Senior may need emergency help. Last message: ' + lastMsg,
          actionNeeded: 'Contact family and emergency services immediately',
          note: 'Emergency keywords detected'
        };

      case 'verify_medication':
        return {
          alert: false,
          note: 'Medication mentioned. Verify if taken today.',
          followUp: 'Did you take all your medications today?'
        };

      case 'general_wellness':
        return {
          alert: false,
          note: 'General wellness check continues'
        };

      default:
        return { alert: false, note: 'Unknown step' };
    }
  }

  async critic(stepResult) {
    const hasRequiredFields = stepResult.alert !== undefined && stepResult.note !== undefined;
    const isActionable = stepResult.alert ? (!!stepResult.actionNeeded && !!stepResult.message) : true;

    return {
      pass: hasRequiredFields && isActionable,
      quality: hasRequiredFields ? 5 : 2,
      issue: hasRequiredFields ? null : 'Missing required fields in step result'
    };
  }

  async run(messages) {
    const plan = await this.plan(messages);
    console.log(`TRIAD: Risk level ${plan.riskLevel}, ${plan.steps.length} steps`);

    const results = [];
    for (const step of plan.steps) {
      console.log(`TRIAD: Executing step ${step.id} - ${step.action}`);
      const result = await this.executeStep(step, messages);
      
      const validation = await this.critic(result);
      console.log(`TRIAD: Step ${step.id} validation - pass:${validation.pass}, quality:${validation.quality}`);

      if (!validation.pass) {
        console.log(`TRIAD: Step ${step.id} failed: ${validation.issue}`);
      }

      results.push({ ...result, step: step.action });
    }

    const emergency = results.find(r => r.alertType === 'EMERGENCY');
    if (emergency) {
      return {
        riskLevel: 'critical',
        alert: true,
        alertType: 'EMERGENCY',
        message: emergency.message,
        actionNeeded: emergency.actionNeeded
      };
    }

    const medication = results.find(r => r.step === 'verify_medication');
    return {
      riskLevel: plan.riskLevel,
      alert: false,
      followUpQuestion: medication?.followUp || null,
      notes: results.map(r => r.note).filter(Boolean)
    };
  }
}

module.exports = { TriadSafetyChecker };
