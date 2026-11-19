<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AccountInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $username, string $email, string $token, public bool $existingIdentity = false)
    {
        $this->activationUrl = rtrim(config('app.frontend_url'), '/')
            .'/invitation/accept#email='.rawurlencode($email).'&token='.rawurlencode($token)
            .($existingIdentity ? '&existing=1' : '');
    }

    public string $activationUrl;

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Activate your VYBE account');
    }

    public function content(): Content
    {
        return new Content(view: 'mail.account-invitation');
    }
}
