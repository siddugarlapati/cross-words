// Resend Email Service for AutoCross-Edu (Anurag University)

const resendApiKey = import.meta.env.VITE_RESEND_API_KEY || '';
// Use configurable sender email — set VITE_RESEND_FROM_EMAIL in your environment.
// Must be a verified domain in your Resend account.
const fromEmail = import.meta.env.VITE_RESEND_FROM_EMAIL || 'noreply@anurag.edu.in';

export interface StudentEmailParams {
  studentName: string;
  studentEmail: string;
  rollNumber: string;
  assessmentTitle: string;
  subject: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  violations?: number;
}

export interface FacultyEmailParams {
  facultyEmail: string;
  facultyName: string;
  studentName: string;
  rollNumber: string;
  studentEmail: string;
  assessmentTitle: string;
  subject: string;
  score: number;
  totalQuestions: number;
  timeTakenSeconds: number;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

/**
 * Escapes HTML entities to prevent XSS injection in email HTML templates.
 * All user-provided strings MUST be escaped before embedding in HTML.
 */
function escapeHtml(unsafe: string): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const emailService = {
  /**
   * Send student assessment score and performance feedback email via Resend
   */
  async sendStudentResultEmail(params: StudentEmailParams): Promise<boolean> {
    if (!params.studentEmail || !params.studentEmail.includes('@')) {
      console.warn('[Email] Invalid student email address:', params.studentEmail);
      return false;
    }

    if (!resendApiKey) {
      console.warn('[Email] No Resend API key configured. Email not sent.');
      return false;
    }

    const percentage = params.totalQuestions > 0
      ? Math.round((params.score / params.totalQuestions) * 100)
      : 0;
    const badgeColor = percentage >= 80 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444';
    const feedbackMsg = percentage >= 80
      ? 'Outstanding performance! You have demonstrated exceptional mastery of this curriculum topic.'
      : percentage >= 50
        ? 'Good effort! You have a solid grasp of the concepts, with room for minor revision.'
        : 'Keep practicing! Review the course material and attempt future crosswords to strengthen your understanding.';

    // SECURITY: All user-provided values are HTML-escaped before embedding
    const safeStudentName = escapeHtml(params.studentName);
    const safeAssessmentTitle = escapeHtml(params.assessmentTitle);
    const safeSubject = escapeHtml(params.subject);
    const safeRollNumber = escapeHtml(params.rollNumber);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0b1120; color: #f1f5f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #002147; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .header { background-color: #001529; padding: 24px; text-align: center; border-bottom: 3px solid #b01c1e; }
          .header-title { color: #ffffff; font-size: 22px; font-weight: 800; margin: 8px 0 0 0; letter-spacing: 0.5px; }
          .header-subtitle { color: #d4af37; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px; }
          .body-content { padding: 32px 24px; }
          .student-card { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; }
          .score-box { background: linear-gradient(135deg, #001529 0%, #002147 100%); border: 2px solid ${badgeColor}; border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 24px; }
          .score-num { font-size: 48px; font-weight: 900; color: ${badgeColor}; line-height: 1; }
          .score-label { color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; margin-top: 6px; }
          .stat-grid { display: flex; justify-content: space-around; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 10px; margin-top: 16px; }
          .stat-item { text-align: center; }
          .stat-val { color: #ffffff; font-size: 18px; font-weight: 700; }
          .stat-lbl { color: #94a3b8; font-size: 11px; text-transform: uppercase; }
          .feedback { background-color: rgba(16, 185, 129, 0.1); border-left: 4px solid ${badgeColor}; padding: 16px; border-radius: 8px; font-size: 14px; line-height: 1.5; color: #e2e8f0; }
          .footer { background-color: #001529; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.08); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="font-size: 24px;">🎓</div>
            <div class="header-title">ANURAG UNIVERSITY</div>
            <div class="header-subtitle">AutoCross-Edu Assessment Results</div>
          </div>
          <div class="body-content">
            <h2 style="color: #ffffff; margin-top: 0;">Assessment Completed 🎉</h2>
            <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
              Dear <strong>${safeStudentName}</strong>, your answers for the assessment <strong>&ldquo;${safeAssessmentTitle}&rdquo;</strong> (${safeSubject}) have been submitted and evaluated.
            </p>

            <div class="student-card">
              <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Student Details</div>
              <div style="font-size: 15px; color: #ffffff; font-weight: 700;">${safeStudentName}</div>
              <div style="font-size: 13px; color: #d4af37; font-family: monospace;">Hall Ticket: ${safeRollNumber}</div>
            </div>

            <div class="score-box">
              <div class="score-num">${params.score} / ${params.totalQuestions}</div>
              <div class="score-label">Score (${percentage}% Accuracy)</div>

              <div class="stat-grid">
                <div class="stat-item">
                  <div class="stat-val">${percentage}%</div>
                  <div class="stat-lbl">Accuracy</div>
                </div>
                <div class="stat-item">
                  <div class="stat-val">${escapeHtml(formatTime(params.timeTakenSeconds))}</div>
                  <div class="stat-lbl">Time Taken</div>
                </div>
                <div class="stat-item">
                  <div class="stat-val">${params.totalQuestions}</div>
                  <div class="stat-lbl">Total Clues</div>
                </div>
              </div>
            </div>

            <div class="feedback">
              <strong>Instructor Feedback:</strong><br/>
              ${escapeHtml(feedbackMsg)}
            </div>
          </div>
          <div class="footer">
            Official Assessment Report &bull; Anurag University Educational Platform<br/>
            This is an automated notification. Please do not reply to this email.
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [params.studentEmail],
          subject: `Your Assessment Results: ${params.assessmentTitle} — ${params.score}/${params.totalQuestions}`,
          html: htmlContent
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        console.error('[Email] Resend API Error (Student Email):', resData);
        return false;
      }
      console.log('[Email] Student result email sent successfully to:', params.studentEmail);
      return true;
    } catch (err) {
      console.error('[Email] Failed to send student result email:', err);
      return false;
    }
  },

  /**
   * Send assessment submission summary report email to the Faculty member
   */
  async sendFacultyReportEmail(params: FacultyEmailParams): Promise<boolean> {
    if (!params.facultyEmail || !params.facultyEmail.includes('@')) {
      console.warn('[Email] Invalid faculty email address:', params.facultyEmail);
      return false;
    }

    if (!resendApiKey) {
      console.warn('[Email] No Resend API key configured. Email not sent.');
      return false;
    }

    const percentage = params.totalQuestions > 0
      ? Math.round((params.score / params.totalQuestions) * 100)
      : 0;

    // SECURITY: All user-provided values are HTML-escaped
    const safeFacultyName = escapeHtml(params.facultyName);
    const safeStudentName = escapeHtml(params.studentName);
    const safeRollNumber = escapeHtml(params.rollNumber);
    const safeStudentEmail = escapeHtml(params.studentEmail);
    const safeAssessmentTitle = escapeHtml(params.assessmentTitle);
    const safeSubject = escapeHtml(params.subject);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0b1120; color: #f1f5f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #002147; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .header { background-color: #001529; padding: 24px; text-align: center; border-bottom: 3px solid #b01c1e; }
          .header-title { color: #ffffff; font-size: 20px; font-weight: 800; }
          .body-content { padding: 32px 24px; }
          .detail-box { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; margin: 20px 0; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
          .lbl { color: #94a3b8; font-size: 13px; }
          .val { color: #ffffff; font-weight: 700; font-size: 13px; }
          .footer { background-color: #001529; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="header-title">📋 Faculty Submission Alert</div>
            <div style="color: #d4af37; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 4px;">Anurag University Assessment Portal</div>
          </div>
          <div class="body-content">
            <h3 style="color: #ffffff; margin-top: 0;">New Student Submission Recorded</h3>
            <p style="color: #cbd5e1; font-size: 14px;">
              Dear <strong>${safeFacultyName}</strong>, a student has completed your crossword assessment: <strong>&ldquo;${safeAssessmentTitle}&rdquo;</strong> (${safeSubject}).
            </p>

            <div class="detail-box">
              <div class="row">
                <span class="lbl">Student Name</span>
                <span class="val">${safeStudentName}</span>
              </div>
              <div class="row">
                <span class="lbl">Hall Ticket / Roll No</span>
                <span class="val" style="color: #d4af37; font-family: monospace;">${safeRollNumber}</span>
              </div>
              <div class="row">
                <span class="lbl">Student Email</span>
                <span class="val">${safeStudentEmail}</span>
              </div>
              <div class="row">
                <span class="lbl">Score Achieved</span>
                <span class="val" style="color: #10b981;">${params.score} / ${params.totalQuestions} (${percentage}%)</span>
              </div>
              <div class="row" style="border-bottom: none;">
                <span class="lbl">Time Taken</span>
                <span class="val">${escapeHtml(formatTime(params.timeTakenSeconds))}</span>
              </div>
            </div>

            <p style="font-size: 13px; color: #94a3b8;">
              You can review overall class performance, manage re-attempts, or download reports anytime on your Faculty Dashboard.
            </p>
          </div>
          <div class="footer">
            AutoCross-Edu Faculty Notification System &bull; Anurag University
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [params.facultyEmail],
          subject: `New Submission: ${params.studentName} (${params.rollNumber}) — ${params.assessmentTitle}`,
          html: htmlContent
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        console.error('[Email] Resend API Error (Faculty Email):', resData);
        return false;
      }
      console.log('[Email] Faculty report email sent successfully to:', params.facultyEmail);
      return true;
    } catch (err) {
      console.error('[Email] Failed to send faculty report email:', err);
      return false;
    }
  }
};
