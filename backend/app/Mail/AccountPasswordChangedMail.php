<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AccountPasswordChangedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $username) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your VYBE password was changed');
    }

    public function content(): Content
    {
        return new Content(view: 'mail.account-password-changed');
    }
}
