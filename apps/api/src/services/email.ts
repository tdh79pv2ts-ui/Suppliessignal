export type DailyBriefEmail = { to: string; from: string; subject: string; html: string };
export interface EmailProvider { readonly name: string; send(message: DailyBriefEmail): Promise<{ id: string }> }

export class FakeEmailProvider implements EmailProvider {
  readonly name = 'fake';
  readonly messages: DailyBriefEmail[] = [];
  async send(message: DailyBriefEmail) { this.messages.push(message); return { id: `fake-${this.messages.length}` }; }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  constructor(private readonly apiKey: string) {}
  async send(message: DailyBriefEmail): Promise<{ id: string }> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error('EMAIL_PROVIDER_FAILED');
    const body = await response.json() as { id?: string };
    if (!body.id) throw new Error('EMAIL_PROVIDER_INVALID_RESPONSE');
    return { id: body.id };
  }
}
