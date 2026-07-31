import nodemailer from "nodemailer";
import { config } from "../config.js";

let transporter;

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mailTransport() {
  if (!config.mail.host || !config.mail.user || !config.mail.password) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.password },
    });
  }
  return transporter;
}

export async function sendMailSafe(message) {
  const transport = mailTransport();
  if (!transport) {
    console.warn(`Email skipped because SMTP is not configured: ${message.subject}`);
    return { delivered: false, skipped: true };
  }
  try {
    const result = await transport.sendMail({ from: config.mail.from, ...message });
    return { delivered: true, messageId: result.messageId };
  } catch (error) {
    console.error(`Email delivery failed (${message.subject}):`, error.message);
    return { delivered: false, error: error.message };
  }
}

export async function sendWellnessSubmissionEmails({ user, profile, reviewCase }) {
  const name = `${user.first_name} ${user.family_name}`.trim();
  const profileUrl = `${config.frontendUrl.replace(/\/$/, "")}/my-profile`;
  const fields = [
    ["Current symptoms", profile.current_symptoms],
    ["Duration", profile.symptoms_duration],
    ["Frequency", profile.symptoms_frequency],
    ["Takes medication", profile.takes_medication ? "Yes" : "No"],
    ["Medication details", profile.medication_details],
    ["Ongoing conditions", profile.ongoing_conditions],
    ["Family medical history", profile.family_medical_history],
    ["Treatments tried", profile.treatments_tried],
    ["Chronic diseases", profile.chronic_diseases],
    ["Wellness goals", profile.wellness_goals],
  ];
  const details = fields
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #eee">${htmlEscape(label)}</th><td style="padding:8px;border-bottom:1px solid #eee">${htmlEscape(value)}</td></tr>`)
    .join("");

  const reviewer = sendMailSafe({
    to: config.reviewRecipients,
    replyTo: user.email,
    subject: `New wellness profile for review – ${reviewCase.reference}`,
    text: `A new wellness profile was submitted by ${name} (${user.email}). Reference: ${reviewCase.reference}. Review it in the Happy Drops admin workflow.`,
    html: `<h2>New wellness profile submitted</h2><p><strong>Reference:</strong> ${htmlEscape(reviewCase.reference)}</p><p><strong>Customer:</strong> ${htmlEscape(name)} (${htmlEscape(user.email)})</p><table style="border-collapse:collapse;width:100%">${details}</table><p><a href="${htmlEscape(profileUrl)}">Open the Happy Drops review workflow</a></p><p>This message contains private wellness information. Handle it confidentially and do not forward it.</p>`,
  });

  const customer = sendMailSafe({
    to: user.email,
    subject: `We received your Happy Drops wellness profile – ${reviewCase.reference}`,
    text: `Hello ${name}, thank you for completing your Happy Drops wellness profile. Your information has been received and sent for review. We will get back to you when your personalized recommendation is ready. You can follow progress in your profile: ${profileUrl}`,
    html: `<h2>Thank you, ${htmlEscape(user.first_name)}</h2><p>We have received your Happy Drops wellness profile and sent it for professional review.</p><p>We will get back to you when your personalized recommendation is ready. You can follow each stage securely from your profile.</p><p><strong>Reference:</strong> ${htmlEscape(reviewCase.reference)}</p><p><a href="${htmlEscape(profileUrl)}">View your wellness progress</a></p>`,
  });

  const [reviewerResult, customerResult] = await Promise.all([reviewer, customer]);
  return { reviewer: reviewerResult, customer: customerResult };
}

export async function sendWellnessStatusEmail({ user, reviewCase }) {
  const profileUrl = `${config.frontendUrl.replace(/\/$/, "")}/my-profile`;
  return sendMailSafe({
    to: user.email,
    subject: `Your Happy Drops wellness progress was updated – ${reviewCase.reference}`,
    text: `Hello ${user.first_name}, your wellness review is now ${reviewCase.status.replaceAll("_", " ").toLowerCase()}. ${reviewCase.reviewer_message || ""} View progress: ${profileUrl}`,
    html: `<h2>Your wellness progress was updated</h2><p>Hello ${htmlEscape(user.first_name)},</p><p>Your review status is now <strong>${htmlEscape(reviewCase.status.replaceAll("_", " "))}</strong>.</p>${reviewCase.reviewer_message ? `<p>${htmlEscape(reviewCase.reviewer_message)}</p>` : ""}<p><a href="${htmlEscape(profileUrl)}">View your wellness progress</a></p><p><strong>Reference:</strong> ${htmlEscape(reviewCase.reference)}</p>`,
  });
}
