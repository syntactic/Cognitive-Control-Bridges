// Participant-facing consent and debrief copy, shown by showConsent()/showDebrief()
// in session.js. Adapted from the University of Osnabrück standard template (Peter König)

const CONSENT_HEADING_STYLE =
    'color:#a0c4ff; font-size:1.02em; font-weight:600; margin:14px 0 4px;';

const DEFAULT_CONSENT_TEXT = `
<p style="margin-top:0;"><strong>Study title:</strong> Cognitive control in perceptual
decision tasks</p>
<p><strong>Principal investigator:</strong> Prof. Dr. Sebastian Musslick,
Institute of Cognitive Science, University of Osnabrück, Germany.</p>
<p>Thank you for your interest. Please read this information carefully before you
decide whether to take part. It explains what the study involves, what data we
collect, and how we protect it. Taking part is voluntary.</p>

<h3 style="${CONSENT_HEADING_STYLE}">1. What is this study about?</h3>
<p>We study how people direct attention and make quick decisions about simple visual
displays. The results help us understand how the mind selects what to respond to when
more than one thing competes for attention. There are no right or wrong people for
this task, as we are interested in typical patterns of speed and accuracy.</p>

<h3 style="${CONSENT_HEADING_STYLE}">2. What will you do?</h3>
<p>The whole session takes about 25–35 minutes and runs entirely in your web
browser. You will first read short instructions and complete a brief guided practice.
Then, over several short blocks with self-paced breaks, you will look at simple
displays of red birds on the screen and respond as quickly and accurately as you can 
by pressing keys on your keyboard. You need only a desktop or laptop computer with a 
physical keyboard.</p>

<h3 style="${CONSENT_HEADING_STYLE}">3. What data do we collect?</h3>
<p>We record only what you do in the task: the keys you press, how fast you press
them, and whether each response was correct. We also store the study condition you
were assigned to and your Prolific participant ID, which lets us confirm your
completion and pay you. We do <strong>not</strong> collect your name, and we do not
ask for any information beyond the task itself. Any demographic information (such as
age) comes only from what you have already chosen to share with Prolific. <b>[is this even 
true? what do we get from Prolific?]</b></p>

<h3 style="${CONSENT_HEADING_STYLE}">4. Are there any risks or benefits?</h3>
<p>This is an ordinary computer task and carries no risks beyond those of normal screen
use. It can feel repetitive, and your eyes or hand may tire a little; you can rest
during the scheduled breaks. There is no direct benefit to you other than your
compensation, but you contribute to basic research on human cognition.</p>

<h3 style="${CONSENT_HEADING_STYLE}">5. Voluntary participation and withdrawal</h3>
<p>Your participation is entirely voluntary. You may stop at any time by closing the
browser window, without giving a reason and without any disadvantage. If you stop
early, the responses saved up to that point are kept unless you ask us to delete them.
Because your data are stored under your Prolific ID until they are anonymized for
analysis, you can request deletion by contacting us with that ID at any time before
the data are anonymized and published; after that, deletion is no longer possible
because the data can no longer be traced to you.</p>

<h3 style="${CONSENT_HEADING_STYLE}">6. Confidentiality and data protection</h3>
<p>Your task responses are stored on a secured server located in the European Union 
and are handled in line with the EU General Data Protection Regulation (GDPR).
During data collection your records are linked only to your pseudonymous Prolific ID
and never to your name. For scientific analysis and publication, the Prolific ID is
removed so that the dataset is anonymous and can no longer be traced to you. Access to
the data while it is still pseudonymous is limited to the research team named below.
The anonymized data, and analyses derived from it, may be shared openly for reproducible
research, for example under a Creative Commons (CC0) license <b>[Will we do this?]</b>.
Data are retained for at least 10 years <b>[what do we do?]</b> in line with good
scientific practice. You have the right to access, correct, or request deletion of your
data while it can still be identified, and to lodge a complaint with a data protection
supervisory authority.</p>

<h3 style="${CONSENT_HEADING_STYLE}">7. Compensation</h3>
<p>You are paid through Prolific at the rate stated on the study's Prolific page. If you
withdraw partway through, compensation follows Prolific's partial-completion policy. No
other benefits are promised.</p>

<h3 style="${CONSENT_HEADING_STYLE}">8. Contact</h3>
<p>If you have questions before, during, or after the study, contact
the Autonomous Empirical Research Group at
<a href="mailto:autonomous.research.group@gmail.com" style="color:#a0c4ff;">autonomous.research.group@gmail.com</a>
(Institute of Cognitive Science, University of Osnabrück).</p>

<h3 style="${CONSENT_HEADING_STYLE}">Your consent</h3>
<p>By checking the box below and continuing, you confirm that:</p>
<ul style="margin:4px 0 0; padding-left:20px;">
  <li>you are at least 18 years old;</li>
  <li>you have read and understood the information above and have had the chance to
      consider it;</li>
  <li>you take part voluntarily and understand that you may stop at any time without
      disadvantage;</li>
  <li>you agree that your task responses and Prolific ID are stored and analyzed as
      described, on a secured server in the EU;</li>
  <li>you agree that your data may be published in anonymized form, from which you can
      no longer be identified, including under an open (CC0) license;</li>
  <li>you understand that once your data are anonymized for analysis, they can no longer
      be deleted on request.</li>
</ul>
  `;

const DEFAULT_DEBRIEF_TEXT = `
<p>Thank you for taking part!</p>
<p>In this study we are looking at how people focus on one source of information while
ignoring another that competes with it, and how the mind switches between different
task rules. The displays you responded to were designed so that the relevant and
irrelevant features sometimes agreed and sometimes conflicted, which lets us measure
the cost of resolving that conflict.</p>
<p>Your responses have been saved. If you have any questions about the study, you can
contact  the Autonomous Empirical Research Group at
<a href="mailto:autonomous.research.group@gmail.com" style="color:#a0c4ff;">autonomous.research.group@gmail.com</a>
.</p>
`;
