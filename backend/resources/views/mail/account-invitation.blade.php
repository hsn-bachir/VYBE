<p>Hello {{ $username }},</p>
<p>An administrator created a VYBE account for you. {{ $existingIdentity ? 'Sign in to your existing Firebase account using the link below to connect it to VYBE.' : 'Set your password using the link below.' }} The link expires in {{ config('invitations.expires_minutes') }} minutes and works once.</p>
<p><a href="{{ $activationUrl }}">Activate your VYBE account</a></p>
<p>If you did not expect this invitation, you can ignore this email.</p>
