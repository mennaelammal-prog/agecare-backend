"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLog = auditLog;
function auditLog(req, res, next) {
    const user = req.userId || 'anonymous';
    const ip = req.ip || 'unknown';
    console.log('[Audit] ' + req.method + ' ' + req.path + ' - User: ' + user + ' - IP: ' + ip);
    next();
}
//# sourceMappingURL=audit.js.map