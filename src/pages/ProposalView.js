import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProposalsAPI, ProjectsAPI, InvoicesAPI, NotificationsAPI, SettingsAPI } from '../services/sheets';
import { format, addDays } from 'date-fns';

const BRAND = {
  black:     '#06090A',
  white:     '#ffffff',
  green:     '#6effa0',
  greenSoft: '#e8ffef',
  greenDeep: '#98efb7',
  muted:     '#6b7280',
  border:    '#e5e7eb',
  bg:        '#f3f4f6',
  ink:       '#06090A',
};

const LOGO = 'https://static.wixstatic.com/media/f71431_61430c2cad9d4aa3b3c60140cf727352~mv2.png';

// ── Development Agreement text (word for word from attached RCR agreement) ──
function buildAgreement(clientName, projectTitle, date, companyName) {
  return {
    clientName,
    projectTitle,
    date,
    companyName,
    clauses: [
      {
        heading: 'OPERATIVE PROVISIONS',
        number: null, sub: true,
      },
      {
        number: '1', heading: 'SERVICES',
        body: `a) ${companyName} will provide the Services as set out in Item 3 of the Schedule to the Subscriber in consideration for the Subscriber paying the Fees to ${companyName}, subject to the provisions of this Agreement.\n\nb) ${companyName} will exercise reasonable care, skill and ability when performing the Services.\n\nc) The Services will be performed:\n   i) by ${companyName}'s Personnel or agents that ${companyName} may choose; and\n   ii) from locations that ${companyName} may choose,\n(in its absolute discretion) as most appropriate given the nature of the Services.\n\nd) The Services shall exclude, and ${companyName} shall not be responsible for:\n   i) any equipment, platforms, or IT infrastructure from which the Subscriber or its Personnel accesses the Systems;\n   ii) any design documentation for the Systems prepared by the Subscriber or a third party;\n   iii) correction of errors or Defects caused by operation of the Systems in a manner other than that specified by ${companyName};\n   iv) correction of errors or Defects caused by modification, revision, variation, translation or alteration of the Systems not authorised by ${companyName};\n   v) correction of errors or Defects caused by the use of the Systems by the Subscriber, its Personnel and/or agents;\n   vi) correction of errors or Defects caused in whole or in part by the use of computer programs other than the Systems;\n   vii) correction of errors or Defects caused by the failure of the Subscriber to operate the Systems correctly;\n   viii) training of Subscriber or Personnel which is not specifically provided for in this Agreement;\n   ix) rectification of operator errors or Defects;\n   x) rectification of errors or Defects caused by incorrect use of the Systems;\n   xi) rectification of errors or Defects caused by an equipment fault;\n   xii) equipment maintenance;\n   xiii) development of new software or code to replace substantial parts of the existing Systems (with the exclusion of necessary and reasonable Updates, New Releases or routine maintenance). If development of new software or code is required then such works shall be re-scoped and be at an additional cost to the Subscriber); and\n   xiv) any other incidental services not expressly identified in Item 3 of the Schedule.`,
      },
      {
        number: '2', heading: 'MILESTONE TESTING AND SIGN-OFF',
        body: `a) ${companyName} agrees to use its best efforts to meet the Milestones in accordance with the timetable specified in Item 4 of the Schedule, or as otherwise agreed between the Parties.\n\nb) ${companyName} shall keep the Subscriber informed as to the stage of development and implementation of the Services on request from the Subscriber and shall notify the Subscriber as soon as it becomes aware that it may not be able to complete the Services in accordance with the Milestones.\n\nc) When ${companyName} reaches each Milestone, ${companyName} will demonstrate and/or report the relevant Services to the Subscriber.\n\nd) If the Subscriber is satisfied that the Milestone has been reached, the Subscriber will confirm that the Milestone has been reached by notice in writing to ${companyName}.\n\ne) If the Subscriber is not satisfied that the Milestone has been reached, the Subscriber will notify ${companyName} in writing of the reasons for the Subscriber's decision. The parties will then discuss any necessary revisions to the timetable to enable ${companyName} to meet the Subscriber's requirements and achieve the Milestone(s).`,
      },
      {
        number: '3', heading: 'TRAINING',
        body: `a) ${companyName} shall provide to the Subscriber's nominated Personnel, training if specified in Item 6 of the Schedule.`,
      },
      {
        number: '4', heading: 'FEES',
        body: `a) In consideration for the Services and the delivery of the Systems, the Subscriber must pay the Fees to ${companyName} in accordance with (and on the dates specified in) Item 5 of the Schedule.\n\nb) If Third Party Products are required to perform the Services, then the Third Party Products will be supplied in accordance with the relevant licensor's standard terms. The Subscriber is responsible for any licence fee, purchase of, continued subscription's fees, and any other costs for such Third Party Products.\n\nc) If not otherwise specified, the Fees are exclusive of all taxes, duties (including any sales, use, excise or similar taxes and duties), stamp duty, imposts and other government charges or levies payable in respect of the Systems and in respect of this Agreement.\n\nd) ${companyName} shall provide the Subscriber with a tax invoice for the development and implementation services in accordance with Item 5 of the Schedule.\n\ne) The Subscriber shall pay to ${companyName} the Fees within seven (7) days of issue of a Tax Invoice from ${companyName} in accordance with this clause 4.\n\nf) Each of the payments referred to in this clause 4 shall be made by electronic funds transfer to the Bank Account selected by ${companyName} and notified to the Subscriber.\n\ng) If payment of any component of the Fees is not made by the due date of any invoice, interest will be payable by the Subscriber at the rate equal to 4% higher than the penalty interest rate fixed by the Attorney-General of Victoria pursuant to s2(1) of the Penalty Interest Rate Act 1983 (Vic), calculated monthly for the period from the due date until payment is received on the overdue amount and, if any payment is owing after 14 days from the due date, ${companyName} will be entitled to suspend its remaining obligations under this or any related agreement and discontinue access to the Systems for the Subscriber.\n\nh) Irrespective of the existence of any claim the Subscriber may have against ${companyName}, and except as and to the extent confirmed by ${companyName} in writing, the Subscriber shall not be entitled to withhold, set off or defer payment of any Fees, taxes or other sums payable under this Agreement.\n\ni) The Subscriber shall be liable for all reasonable costs, expenses and disbursements (including reasonable legal costs and collection agency fees) incurred by ${companyName} in pursuing payment of unpaid Fees, on an indemnity basis.`,
      },
      {
        number: '5', heading: 'SUBSCRIBER OBLIGATIONS',
        body: `a) Subscriber must comply with all of ${companyName}'s policies (and the policies of all Third Party Suppliers (as amended from time to time), relating to any System, the Services or the Third Party Products including but not limited to support and usage.\n\nb) The Subscriber is solely responsible for the manner in which the Subscriber Processes and uses the Systems. ${companyName} shall not be responsible for any damage caused by the Subscriber's use of the Systems, including the Subscriber's obligations to any other party. The Subscriber assumes sole responsibility for all results, data, and Subscriber Data obtained from the Systems or Third Party Products or Services, and ${companyName} does not make any warranty or guarantee as to the accuracy or fitness for a particular purpose of any such results, data and Subscriber Data.\n\nc) All Subscriber's Personnel:\n   i) will comply with any other obligations of Subscriber contained in this Agreement; and\n   ii) are deemed to have been duly authorised to act and enter into contract on behalf of the Subscriber and to legally bind the Subscriber.`,
      },
      {
        number: '6', heading: 'LICENCE',
        body: `a) Subject to compliance with the terms of this Agreement, the Subscriber and its Personnel are granted a limited, non-transferable, non-exclusive and revocable licence to use and access the Systems and services provided by ${companyName} as set out in Item 5 of the Schedule, for the purposes of the Subscriber's business, subject to the terms of this Agreement.\n\nb) The Subscriber must not:\n   i) modify, alter or create any derivative works of the Systems or the associated documentation (if any);\n   ii) decompile, disassemble, reverse engineer, attempt to discover the source code or underlying ideas or algorithms of the Systems;\n   iii) breach any intellectual property rights connected with the Systems, or any Third Party Products or Services;\n   iv) circumvent any technological protection measures used to protect the Systems; or\n   v) sub-licence, assign, transfer, sell, resell, lease and rent the Systems or otherwise exploit the System or any part of the Systems.`,
      },
      {
        number: '7', heading: 'APPLICATION OF THIRD PARTY TERMS',
        body: `a) ${companyName} will notify the Subscriber if Third Party Products are required to perform the Services. The Subscriber agrees that Third Party Products will be supplied in accordance with the relevant licensor's standard terms, and the Subscriber must agree to the relevant licensor's standard terms and comply with all obligations under those terms. The Subscriber is liable for the payment of licence fees and all subscription and other associated costs for Third Party Products.\n\nb) ${companyName} does not represent, and cannot warrant that any Third Party Products:\n   i) are appropriate or suitable for the Subscriber's business purpose; or\n   ii) are error free, of good quality and fit for purpose.`,
      },
      {
        number: '8', heading: 'SUPPORT SERVICES',
        body: `a) This clause 8 shall not apply unless the parties agree that ${companyName} will provide support services in relation to the Systems (Support Services), either in Item 3 of the Schedule or otherwise in writing.\n\nb) During the Term, ${companyName} shall provide the Support Services to the Subscriber via email (and during the support hours to be reasonably determined by ${companyName}). For the avoidance of doubt, the Support Services are for the remediation of Defects only.\n\nc) Subject to the terms of this Agreement, ${companyName} shall respond to all Defects in accordance with the response timeframes below:\n   Severity 1 — System Ineffective: Response within 5 Business Days.\n   Severity 2 — Limited effect on System: Response within 7 Business Days.\n   Severity 3 — Minor Impact: Response within 10 Business Days.\n\nd) ${companyName} shall have no obligation to provide the Support Services where the Subscriber has not paid the relevant Fees in accordance with this Agreement.`,
      },
      {
        number: '9', heading: 'WARRANTIES',
        body: `a) To the maximum extent permitted by law, the Systems and Third Party Products are provided on an "as is" basis. ${companyName} does not warrant or represent that the Systems will: i) operate on any infrastructure other than that notified by ${companyName} to the Subscriber; ii) be or remain compatible with any of the Subscriber's software or systems; or iii) be accurate, correct, reliable, adequate or complete.\n\nb) ${companyName} makes no warranties, express or implied, including the warranties of merchantability or fitness for a particular purpose, except as expressly provided in this Agreement.\n\nc) To the extent permitted by law, ${companyName} does not accept responsibility for any Loss that the Subscriber may incur as a result of any actual or perceived loss, theft or otherwise unauthorised use of Subscriber Data.`,
      },
      {
        number: '10', heading: 'INTELLECTUAL PROPERTY',
        body: `a) All Intellectual Property rights in or relating to the Systems or the Services and documentation provided in relation thereto, including user manuals, lists and databases, as well as any new versions and any new features, and any suggestions, ideas, enhancements, requests, feedback, recommendations or other information provided by the Subscriber or its Personnel relating to the Systems, remain proprietary to ${companyName} (or the relevant third party) and all such rights are reserved. To avoid doubt, the Subscriber does not acquire any rights in the Systems or the Services, including any customisations or modifications made by ${companyName} specifically for the Subscriber.\n\nb) Any work, investigations or solutions provided by ${companyName} in connection with the Systems will be owned by ${companyName}. The Subscriber may only use works and solutions provided to it by ${companyName} for the Subscriber's own internal purposes and only in conjunction with the Subscriber's use of the Systems.`,
      },
      {
        number: '11', heading: 'SUBSCRIBER DATA',
        body: `a) All rights, title and interest (including all Intellectual Property rights) in the Subscriber Data vest in the Subscriber upon creation.\n\nb) ${companyName} is granted a licence to store, back up and share Subscriber Data only to the extent necessary to carry out the Systems and Services.\n\nc) The Subscriber warrants that any and all Subscriber Data does not infringe on the intellectual property, confidentiality, privacy or any other rights of any person.`,
      },
      {
        number: '12', heading: 'PRIVACY',
        body: `a) The Subscriber must comply at all times with applicable Privacy Laws in relation to the Subscriber Data, including any Personal Information contained therein.\n\nb) The Subscriber agrees that ${companyName} may store and process Subscriber Data (including Personal Information) in any location ${companyName} or their Third Party service providers operate, subject at all times to ${companyName}'s Privacy Policy and the relevant Privacy Laws.`,
      },
      {
        number: '13', heading: 'CONFIDENTIALITY',
        body: `a) Each Party agrees that it will not, without the prior written approval of the other Party, disclose the other Party's Confidential Information.\n\nb) Each Party must take all reasonable steps to ensure that their Personnel and any sub-contractors engaged for the purpose of this Agreement do not make public or disclose the other Party's Confidential Information.\n\nc) On termination or completion of the Services, each Party must return to the other Party or destroy (if requested) all Confidential Information and all documents containing Confidential Information.`,
      },
      {
        number: '14', heading: 'TERM AND TERMINATION',
        body: `a) This Agreement commences on the Commencement Date and will continue for the Term unless terminated earlier in accordance with this clause 14.\n\nb) ${companyName} may terminate this Agreement immediately by notice in writing to the Subscriber if:\n   i) the Subscriber fails to pay any Fees when due and fails to remedy that breach within 14 days of being notified; or\n   ii) the Subscriber commits a breach of any other term of this Agreement and fails to remedy that breach within 14 days of receiving written notice.\n\nc) Either Party may terminate this Agreement immediately by written notice to the other Party if the other Party ceases to carry on business or enters into any arrangements with creditors or goes into receivership, administration or liquidation.`,
      },
      {
        number: '15', heading: 'CONSEQUENCES OF TERMINATION',
        body: `a) On termination of this Agreement for any reason:\n   i) the Subscriber must immediately cease using the Systems;\n   ii) all unpaid Fees and other amounts owed by the Subscriber to ${companyName} will become immediately due and payable; and\n   iii) the Subscriber must return or destroy (at ${companyName}'s direction) any Confidential Information in its possession or control.\n\nb) Termination of this Agreement does not affect any accrued rights or liabilities of either Party.`,
      },
      {
        number: '16', heading: 'MARKETING AND ADVERTISEMENTS',
        body: `a) The Subscriber agrees that ${companyName} may refer to the Subscriber, including a general description of the Services, in its marketing, case studies or advertising material unless the Subscriber expressly requests otherwise in writing.`,
      },
      {
        number: '17', heading: 'RELATIONSHIP BETWEEN THE PARTIES',
        body: `a) The relationship between the Parties under this Agreement is that of independent contractors. Nothing in this Agreement is intended to constitute a relationship between the Parties of partnership, joint venture, employer–employee or principal–agent.`,
      },
      {
        number: '19', heading: 'ACCEPTANCE OF TERMS',
        body: `a) The Subscriber will be taken to have accepted the terms and conditions of this Agreement if they:\n   i) sign this Agreement;\n   ii) continue to use the Systems; or\n   iii) pay any Fees to ${companyName}, after receiving a copy of this Agreement.`,
      },
      {
        number: '20', heading: 'ENTIRE AGREEMENT',
        body: `a) This Agreement constitutes the entire agreement between the Parties and supersedes all prior discussions, representations, negotiations, understandings and agreements in relation to its subject matter.`,
      },
      {
        number: '21', heading: 'CURRENCY OF AMOUNTS',
        body: `a) Unless otherwise stated, all amounts referred to in this Agreement are expressed in Australian dollars.`,
      },
      {
        number: '28', heading: 'ACCEPTANCE OF ELECTRONIC COMMUNICATIONS',
        body: `a) The Subscriber agrees to the use of electronic communications for all communications, notices and documentation under this Agreement, to the extent permitted by law.`,
      },
      {
        number: '29', heading: 'ELECTRONIC EXECUTION',
        body: `a) This Agreement may be executed electronically and in counterparts.`,
      },
    ],
  };
}

export default function ProposalView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proposal, setProposal]     = useState(null);
  const [settings, setSettings]     = useState({});
  const [loading, setLoading]       = useState(true);
  const [acting, setActing]         = useState(null);
  const [error, setError]           = useState(null);
  const [step, setStep]             = useState('proposal'); // 'proposal' | 'contract' | 'sign'
  const [signatureName, setSignatureName] = useState('');
  const [hasScrolled, setHasScrolled]   = useState(false);
  const [signError, setSignError]   = useState('');
  const contractRef = useRef();

  useEffect(() => { loadData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    try {
      const [p, s] = await Promise.all([ProposalsAPI.get(id), SettingsAPI.getAll()]);
      if (!p) { setError('Proposal not found'); return; }
      setProposal(p);
      setSettings(s);
    } catch { setError('Failed to load proposal'); }
    finally { setLoading(false); }
  }

  // Track scroll progress through contract
  function handleContractScroll(e) {
    const el = e.target;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
    if (nearBottom) setHasScrolled(true);
  }

  async function handleSign() {
    if (!signatureName.trim()) { setSignError('Please enter your full name to sign.'); return; }
    if (signatureName.trim().length < 3) { setSignError('Please enter your full name.'); return; }
    setSignError('');
    setActing('accept');

    try {
      await ProposalsAPI.update(id, { status: 'accepted', responded_at: new Date().toISOString() });

      const project = await ProjectsAPI.create({
        title: proposal.title,
        client_id: proposal.client_id,
        client_name: proposal.client_name,
        type: 'Web Development',
        status: 'active',
        current_stage: 'Discovery',
        stage_completion: {},
        total_fee: proposal.total_amount,
        description: proposal.scope,
      });

      const paymentSchedule = typeof proposal.payment_schedule === 'object'
        ? proposal.payment_schedule
        : (() => { try { return JSON.parse(proposal.payment_schedule || '[]'); } catch { return []; } })();

      const firstPayment = paymentSchedule[0];
      const invoiceAmount = firstPayment
        ? (parseFloat(proposal.total_amount) * firstPayment.percentage / 100)
        : parseFloat(proposal.total_amount) * 0.5;

      await InvoicesAPI.create({
        invoice_number: `INV-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        project_id: project.id,
        project_title: project.title,
        client_id: proposal.client_id,
        client_name: proposal.client_name,
        client_email: proposal.client_email,
        stage: 'Discovery',
        stage_description: `${firstPayment?.milestone || 'Deposit on Acceptance'} — ${proposal.title}`,
        amount: invoiceAmount,
        due_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
        status: 'sent',
        charge_gst: false,
      });

      await NotificationsAPI.create({
        type: 'proposal_accepted',
        title: `Proposal accepted — ${proposal.title}`,
        message: `${signatureName} (${proposal.client_name}) signed and accepted the proposal.`,
      });

      try {
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'internal_notification',
            to: settings?.admin_email || 'hello@nex-a.com.au',
            subject: `✓ Proposal signed — ${proposal.title}`,
            heading: 'Proposal Signed & Accepted',
            body: `<strong>${signatureName}</strong> (${proposal.client_name}) has signed and accepted the Development Agreement for <strong>${proposal.title}</strong>.`,
            detail: `Amount: $${Number(proposal.total_amount || 0).toLocaleString('en-AU')} AUD · Signed: ${new Date().toLocaleString('en-AU')}`,
            cta_label: 'View Proposal',
            cta_url: `${window.location.origin}/proposal/${proposal.id}`,
            status: 'accepted',
          }),
        });
      } catch {}

      navigate('/thank-you');
    } catch (err) {
      alert('Something went wrong: ' + err.message);
      setActing(null);
    }
  }

  async function handleDecline() {
    setActing('decline');
    try {
      await ProposalsAPI.update(id, { status: 'declined', responded_at: new Date().toISOString() });
      await NotificationsAPI.create({
        type: 'proposal_declined',
        title: `Proposal declined — ${proposal.title}`,
        message: `${proposal.client_name} declined the proposal.`,
      });
      try {
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'internal_notification',
            to: settings?.admin_email || 'hello@nex-a.com.au',
            subject: `✕ Proposal declined — ${proposal.title}`,
            heading: 'Proposal Declined',
            body: `${proposal.client_name} has declined the proposal for <strong>${proposal.title}</strong>.`,
            detail: `Amount: $${Number(proposal.total_amount || 0).toLocaleString('en-AU')} AUD`,
            cta_label: 'View Proposal',
            cta_url: `${window.location.origin}/proposal/${proposal.id}`,
            status: 'declined',
          }),
        });
      } catch {}
      setProposal(prev => ({ ...prev, status: 'declined' }));
    } catch { alert('Something went wrong'); }
    finally { setActing(null); }
  }

  const paymentSchedule = proposal
    ? (typeof proposal.payment_schedule === 'object'
        ? proposal.payment_schedule
        : (() => { try { return JSON.parse(proposal.payment_schedule || '[]'); } catch { return []; } })())
    : [];

  const companyName = settings.company_name || 'NEX-A TECHNOLOGY SOLUTIONS';
  const totalAmount = parseFloat(proposal?.total_amount || 0);
  const isActed = proposal?.status === 'accepted' || proposal?.status === 'declined';
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.bg }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${BRAND.border}`, borderTopColor: BRAND.black, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.bg, fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: BRAND.ink, marginBottom: 8 }}>Proposal Not Found</h2>
        <p style={{ color: BRAND.muted }}>{error}</p>
      </div>
    </div>
  );

  const agreement = buildAgreement(proposal.client_name, proposal.title, today, companyName);

  return (
    <div style={{ minHeight: '100vh', background: BRAND.bg, fontFamily: "'Instrument Sans', system-ui, -apple-system, sans-serif", color: BRAND.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        *{box-sizing:border-box}
        .sig-input::placeholder{color:#d1d5db;font-style:italic}
      `}</style>

      {/* ── Top nav bar ── */}
      <div style={{ background: BRAND.black, padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={LOGO} alt="NEX-A" style={{ height: 32, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
            onError={e => { e.target.style.display = 'none'; }} />
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {companyName}
          </span>
        </div>
        {/* Step indicator */}
        {!isActed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            {[
              { key: 'proposal', label: '1. Review Proposal' },
              { key: 'contract', label: '2. Review Contract' },
              { key: 'sign',     label: '3. Sign & Accept' },
            ].map((s, i, arr) => (
              <React.Fragment key={s.key}>
                <span style={{
                  color: step === s.key ? BRAND.green : (
                    ['proposal','contract','sign'].indexOf(step) > i
                      ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)'
                  ),
                  fontWeight: step === s.key ? 600 : 400,
                }}>{s.label}</span>
                {i < arr.length - 1 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>›</span>}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ── STEP 1: PROPOSAL ── */}
      {step === 'proposal' && (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px 80px', animation: 'fadeUp 0.4s ease' }}>

          {/* Status banner */}
          {isActed && (
            <div style={{
              padding: '14px 20px', borderRadius: 10, marginBottom: 24,
              background: proposal.status === 'accepted' ? BRAND.greenSoft : '#fee2e2',
              border: `1px solid ${proposal.status === 'accepted' ? BRAND.greenDeep : '#fca5a5'}`,
              color: proposal.status === 'accepted' ? '#065f46' : '#991b1b',
              fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span>{proposal.status === 'accepted' ? '✓' : '✕'}</span>
              This proposal has been <strong>{proposal.status}</strong>.
            </div>
          )}

          {/* Hero card */}
          <div style={{ background: BRAND.black, borderRadius: 16, padding: '40px 44px', marginBottom: 3, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, background: BRAND.green, borderRadius: '50%', opacity: 0.06, pointerEvents: 'none' }} />
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: BRAND.green, marginBottom: 16 }}>Project Proposal</div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: BRAND.white, lineHeight: 1.15, letterSpacing: '-0.5px', marginBottom: 12 }}>{proposal.title}</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 32 }}>
              Prepared exclusively for <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{proposal.client_name}</strong>
            </p>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Investment</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: BRAND.green, letterSpacing: '-0.5px' }}>
                  ${totalAmount.toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                </div>
              </div>
              {proposal.valid_until && (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Valid Until</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                    {new Date(proposal.valid_until + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Content sections */}
          <div style={{ background: BRAND.white, borderRadius: '0 0 16px 16px', marginBottom: 3 }}>
            {proposal.scope && <Section title="Scope of Work"><p style={{ color: '#444', lineHeight: 1.85, fontSize: 14, whiteSpace: 'pre-line' }}>{proposal.scope}</p></Section>}
            {proposal.deliverables && <Section title="Deliverables"><p style={{ color: '#444', lineHeight: 1.85, fontSize: 14, whiteSpace: 'pre-line' }}>{proposal.deliverables}</p></Section>}
            {proposal.timeline && <Section title="Timeline"><p style={{ color: '#444', lineHeight: 1.85, fontSize: 14, whiteSpace: 'pre-line' }}>{proposal.timeline}</p></Section>}
            {paymentSchedule.length > 0 && (
              <Section title="Payment Schedule">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {paymentSchedule.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 18px', borderRadius: 10,
                      background: i === 0 ? BRAND.greenSoft : BRAND.bg,
                      border: `1px solid ${i === 0 ? BRAND.greenDeep : BRAND.border}`,
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink }}>{item.milestone}</div>
                        <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>{item.percentage}% · {item.terms}</div>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: BRAND.ink }}>
                        ${((totalAmount * item.percentage) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {proposal.terms && <Section title="Terms & Conditions" last><p style={{ color: BRAND.muted, lineHeight: 1.85, fontSize: 13, whiteSpace: 'pre-line' }}>{proposal.terms}</p></Section>}
          </div>

          {/* CTA */}
          {!isActed && (
            <div style={{ background: BRAND.black, borderRadius: 16, padding: '36px 44px', marginTop: 3, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -40, left: -40, width: 160, height: 160, background: BRAND.green, borderRadius: '50%', opacity: 0.05, pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.white, marginBottom: 6 }}>Ready to move forward?</div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>Review and sign the Development Agreement to lock in your project.</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                  <button onClick={handleDecline} disabled={!!acting} style={{
                    padding: '12px 22px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)',
                    background: 'transparent', color: 'rgba(255,255,255,0.45)', fontSize: 14,
                    cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>
                    {acting === 'decline' ? 'Declining...' : 'Not for us'}
                  </button>
                  <button onClick={() => setStep('contract')} style={{
                    padding: '12px 32px', borderRadius: 999, border: 'none',
                    background: BRAND.green, color: BRAND.black,
                    fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    Review Contract & Sign →
                  </button>
                </div>
              </div>
            </div>
          )}

          <Footer settings={settings} companyName={companyName} />
        </div>
      )}

      {/* ── STEP 2: CONTRACT ── */}
      {step === 'contract' && (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 20px 80px', animation: 'fadeUp 0.35s ease' }}>

          {/* Contract header card */}
          <div style={{ background: BRAND.black, borderRadius: 16, padding: '36px 44px', marginBottom: 3, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, background: BRAND.green, borderRadius: '50%', opacity: 0.06, pointerEvents: 'none' }} />
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: BRAND.green, marginBottom: 14 }}>Development Agreement</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: BRAND.white, marginBottom: 8 }}>Development and Implementation Agreement</h2>
            <div style={{ display: 'flex', gap: 32, marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Prepared for</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.white }}>{proposal.client_name}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Project</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.white }}>{proposal.title}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Date</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{today}</div>
              </div>
            </div>
          </div>

          {/* Scrollable agreement */}
          <div
            ref={contractRef}
            onScroll={handleContractScroll}
            style={{
              background: BRAND.white, borderRadius: '0 0 0 0', overflowY: 'auto',
              maxHeight: '60vh', padding: '36px 44px',
              border: `1px solid ${BRAND.border}`, borderTop: 'none',
            }}>
            {agreement.clauses.map((clause, i) => (
              <div key={i} style={{ marginBottom: 28 }}>
                {clause.sub ? (
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 16, paddingBottom: 8, borderBottom: `2px solid ${BRAND.ink}` }}>
                    {clause.heading}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, marginBottom: 8 }}>
                      {clause.number}. {clause.heading}
                    </div>
                    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.85, whiteSpace: 'pre-line' }}>{clause.body}</div>
                  </>
                )}
              </div>
            ))}

            {/* Schedule summary */}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: `2px solid ${BRAND.ink}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 16 }}>SCHEDULE — Project Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13, color: '#374151' }}>
                <div><strong>Subscriber:</strong> {proposal.client_name}</div>
                <div><strong>Service Provider:</strong> {companyName}</div>
                <div><strong>Project:</strong> {proposal.title}</div>
                <div><strong>Total Investment:</strong> ${totalAmount.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</div>
                <div><strong>Commencement:</strong> Upon signing</div>
                <div><strong>Date:</strong> {today}</div>
              </div>
              {paymentSchedule.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <strong style={{ fontSize: 13 }}>Payment Schedule:</strong>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${BRAND.ink}` }}>
                        <th style={{ padding: '8px 0', textAlign: 'left', color: BRAND.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Milestone</th>
                        <th style={{ padding: '8px 0', textAlign: 'center', color: BRAND.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>%</th>
                        <th style={{ padding: '8px 0', textAlign: 'right', color: BRAND.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (AUD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentSchedule.map((item, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                          <td style={{ padding: '10px 0' }}>{item.milestone}</td>
                          <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.percentage}%</td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 600 }}>
                            ${((totalAmount * item.percentage) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Scroll nudge */}
            {!hasScrolled && (
              <div style={{ textAlign: 'center', padding: '20px 0 0', color: BRAND.muted, fontSize: 12 }}>
                ↓ Scroll to read the full agreement
              </div>
            )}
          </div>

          {/* Scroll progress indicator */}
          <div style={{ background: BRAND.white, padding: '16px 44px', display: 'flex', alignItems: 'center', gap: 12, borderTop: `1px solid ${BRAND.border}` }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: hasScrolled ? BRAND.green : BRAND.border, transition: 'background 0.3s', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: hasScrolled ? '#065f46' : BRAND.muted }}>
              {hasScrolled ? 'You\'ve read the full agreement' : 'Please scroll through the full agreement above'}
            </span>
          </div>

          {/* Actions */}
          <div style={{ background: BRAND.white, borderRadius: '0 0 16px 16px', padding: '24px 44px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BRAND.border}` }}>
            <button onClick={() => setStep('proposal')} style={{
              padding: '10px 20px', borderRadius: 999, border: `1px solid ${BRAND.border}`,
              background: 'transparent', color: BRAND.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>← Back to Proposal</button>
            <button
              onClick={() => { if (hasScrolled) setStep('sign'); }}
              disabled={!hasScrolled}
              style={{
                padding: '12px 32px', borderRadius: 999, border: 'none',
                background: hasScrolled ? BRAND.black : BRAND.border,
                color: hasScrolled ? BRAND.white : BRAND.muted,
                fontSize: 14, fontWeight: 600, cursor: hasScrolled ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.25s',
              }}>
              Proceed to Sign <span style={{ color: hasScrolled ? BRAND.green : 'transparent' }}>→</span>
            </button>
          </div>

          <Footer settings={settings} companyName={companyName} />
        </div>
      )}

      {/* ── STEP 3: SIGN ── */}
      {step === 'sign' && (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px', animation: 'fadeUp 0.35s ease' }}>

          {/* Signature card */}
          <div style={{ background: BRAND.black, borderRadius: 16, padding: '40px 44px', marginBottom: 3, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, background: BRAND.green, borderRadius: '50%', opacity: 0.06, pointerEvents: 'none' }} />
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: BRAND.green, marginBottom: 16 }}>Sign & Accept</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: BRAND.white, marginBottom: 8 }}>Almost there — sign to confirm.</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
              By signing below, {proposal.client_name} agrees to the Development and Implementation Agreement with {companyName} for the {proposal.title} project.
            </p>
          </div>

          <div style={{ background: BRAND.white, borderRadius: '0 0 16px 16px' }}>

            {/* Summary */}
            <div style={{ padding: '28px 44px', borderBottom: `1px solid ${BRAND.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 14 }}>Agreement Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div style={{ color: BRAND.muted }}>Project</div>
                <div style={{ fontWeight: 600, color: BRAND.ink }}>{proposal.title}</div>
                <div style={{ color: BRAND.muted }}>Client</div>
                <div style={{ fontWeight: 600, color: BRAND.ink }}>{proposal.client_name}</div>
                <div style={{ color: BRAND.muted }}>Investment</div>
                <div style={{ fontWeight: 700, color: BRAND.ink }}>${totalAmount.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</div>
                <div style={{ color: BRAND.muted }}>Service Provider</div>
                <div style={{ fontWeight: 600, color: BRAND.ink }}>{companyName}</div>
                <div style={{ color: BRAND.muted }}>Date</div>
                <div style={{ fontWeight: 600, color: BRAND.ink }}>{today}</div>
              </div>
            </div>

            {/* Signature input */}
            <div style={{ padding: '28px 44px', borderBottom: `1px solid ${BRAND.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 6 }}>Your Signature</div>
              <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 16 }}>Type your full legal name below to sign this agreement electronically.</div>
              <input
                className="sig-input"
                type="text"
                value={signatureName}
                onChange={e => { setSignatureName(e.target.value); setSignError(''); }}
                placeholder="Your full name"
                style={{
                  width: '100%', padding: '16px 20px',
                  border: `2px solid ${signError ? '#fca5a5' : signatureName.trim().length > 2 ? BRAND.green : BRAND.border}`,
                  borderRadius: 10, fontSize: 24,
                  fontFamily: 'Georgia, serif', color: BRAND.ink,
                  outline: 'none', transition: 'border-color 0.2s',
                  letterSpacing: '0.02em',
                }}
                onKeyDown={e => e.key === 'Enter' && handleSign()}
              />
              {signatureName.trim().length > 2 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>✓</span> Signed as <strong>{signatureName.trim()}</strong>
                </div>
              )}
              {signError && <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{signError}</div>}
            </div>

            {/* Legal notice */}
            <div style={{ padding: '20px 44px', background: BRAND.bg, fontSize: 11, color: BRAND.muted, lineHeight: 1.7, borderBottom: `1px solid ${BRAND.border}` }}>
              By clicking "Sign & Accept Agreement" you confirm that: (1) you are authorised to enter into this agreement on behalf of {proposal.client_name}; (2) you have read and agree to the Development and Implementation Agreement in full; (3) you understand this constitutes a legally binding electronic signature pursuant to clause 29 of the Agreement.
            </div>

            {/* Action buttons */}
            <div style={{ padding: '24px 44px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setStep('contract')} style={{
                padding: '10px 20px', borderRadius: 999, border: `1px solid ${BRAND.border}`,
                background: 'transparent', color: BRAND.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>← Back</button>
              <button onClick={handleSign} disabled={!!acting} style={{
                padding: '14px 40px', borderRadius: 999, border: 'none',
                background: acting ? BRAND.border : BRAND.black,
                color: acting ? BRAND.muted : BRAND.white,
                fontSize: 15, fontWeight: 700, cursor: acting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
              }}>
                {acting === 'accept'
                  ? 'Processing...'
                  : <><span style={{ color: BRAND.green, fontSize: 18 }}>✓</span> Sign & Accept Agreement</>}
              </button>
            </div>
          </div>

          <Footer settings={settings} companyName={companyName} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children, last }) {
  return (
    <div style={{ padding: '28px 44px', borderBottom: last ? 'none' : `1px solid ${BRAND.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: BRAND.muted, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Footer({ settings, companyName }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 40, fontSize: 12, color: '#aaa' }}>
      <img src={LOGO} alt="NEX-A" style={{ height: 18, opacity: 0.25, marginBottom: 8, display: 'block', margin: '0 auto 8px' }}
        onError={e => { e.target.style.display = 'none'; }} />
      © {new Date().getFullYear()} {companyName}
      {settings.company_email && <> · {settings.company_email}</>}
      <br /><span style={{ fontSize: 11 }}>Crafted Technology for Real-World Results</span>
    </div>
  );
}
