/**
 * Classic-serif starter resume. Browser-safe ESM.
 * Fake John Doe copy only — never Inaayat Gill or her employers.
 */

export const STARTER_RESUME_DOC = {
  v: 1,
  template: 'classic-serif',
  header: {
    name: 'John Doe',
    suffix: '',
    locations: ['Example City, ST'],
    email: 'john.doe@example.com',
    phone: '(555) 010-0000',
    links: [
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/example-john-doe/' },
      { label: 'Portfolio', url: 'https://example.com/john-doe' },
    ],
  },
  sectionOrder: ['experience', 'credentials', 'education', 'additional'],
  sections: {
    experience: {
      title: 'Work Experience',
      jobs: [
        {
          id: 'job_example_finance',
          company: 'Example Financial Group',
          title: 'Associate | Product Operations',
          location: 'Example City, ST',
          start: 'January 2022',
          end: 'Present',
          groups: [
            {
              id: 'grp_example_delivery',
              heading: 'Delivery & Reporting',
              bullets: [
                {
                  id: 'b_example_pack',
                  lead: 'Shipped a weekly status pack',
                  body: 'Built a repeatable report so **12** stakeholders could see one queue instead of three spreadsheets.',
                  priority: 1,
                },
                {
                  id: 'b_example_intake',
                  lead: 'Cut intake turnaround',
                  body: 'Mapped the request form and retired duplicate fields, dropping average cycle time from **5 days** to **2**.',
                  priority: 1,
                },
              ],
            },
            {
              id: 'grp_example_process',
              heading: 'Process Improvement',
              bullets: [
                {
                  id: 'b_example_reconcile',
                  lead: 'Reconciled product and finance counts',
                  body: 'Matched billed seats to active accounts each month and flagged mismatches before close.',
                  priority: 2,
                },
              ],
            },
          ],
        },
        {
          id: 'job_example_retail',
          company: 'Example Retail Co.',
          title: 'Operations Intern',
          location: 'Example City, ST',
          start: 'June 2021',
          end: 'August 2021',
          groups: [
            {
              id: 'grp_example_intern',
              heading: '',
              bullets: [
                {
                  id: 'b_example_intern',
                  lead: '',
                  body: 'Documented store-to-warehouse handoffs and listed the three steps that caused most delays.',
                  priority: 1,
                },
              ],
            },
          ],
        },
      ],
    },
    credentials: {
      title: 'Credentials',
      enabled: true,
      items: [
        {
          id: 'cred_example',
          name: 'Example Professional License',
          issuer: 'Example Licensing Board',
          credentialId: 'EX-0000',
          issued: 'May 2024',
        },
      ],
    },
    education: {
      title: 'Education',
      items: [
        {
          id: 'edu_example',
          school: 'Example University',
          location: 'Example City, ST',
          degree: 'Bachelor of Arts in Example Major',
          details: 'Sample concentration: Product & Finance',
          gpa: '3.5/4.0',
        },
      ],
    },
    additional: {
      title: 'Additional Info',
      rows: [
        {
          id: 'add_example_tools',
          label: 'Tools',
          items: ['Spreadsheets', 'SQL', 'Slideware'],
        },
        {
          id: 'add_example_notes',
          label: 'Working notes',
          items: ['Replace this John Doe starter with your own roles, dates, and metrics.'],
        },
      ],
    },
  },
};
