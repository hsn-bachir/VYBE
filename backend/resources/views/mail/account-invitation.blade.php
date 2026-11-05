<p>Hello {{ $username }},</p>
<p>An administrator created a VYBE account for you. Set your password using the link below. The link expires in {{ config('invitations.expires_minutes') }} minutes and works once.</p>
<p><a href="{{ $activationUrl }}">Activate your VYBE account</a></p>
<p>If you did not expect this invitation, you can ignore this email.</p>
