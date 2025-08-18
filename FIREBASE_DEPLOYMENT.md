# Firebase Deployment Instructions

## Deploying Updated Firestore Rules

The Firestore security rules have been updated to support the `users` collection used by the nickname-based authentication system.

### Updated Rules Summary:
- Added support for `/userId/{nickname}` collection (matches existing Firestore structure)
- Allows read/write access for user registration and data management  
- Maintains existing rules for `/players/{userId}` and `/matches/{matchId}`

### Deployment Steps:

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase project** (if not already done):
   ```bash
   firebase init firestore
   ```
   - Select your existing project: `royalball-8cc64`
   - Choose `firestore.rules` as your rules file
   - Choose any file for indexes (default is fine)

4. **Deploy the updated rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

5. **Verify deployment**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Navigate to your project: `royalball-8cc64`
   - Go to Firestore Database → Rules
   - Verify the new rules are deployed

### New Rules Added:

```javascript
// Правила для коллекции пользователей (nickname-based authentication)
match /userId/{nickname} {
  // Разрешить чтение и запись всем (для nickname-based системы)
  // В будущем можно добавить более строгие правила
  allow read, write: if true;
}
```

### Testing:

After deployment, test the "Create New Account" functionality:
1. Open the game
2. Click "Create New Account"
3. Fill in email, nickname, password
4. Check browser console for Firestore save confirmation
5. Verify user appears in Firebase Console → Firestore → userId collection

### Troubleshooting:

If deployment fails:
- Check that you're logged into the correct Firebase account
- Verify project ID matches: `royalball-8cc64`
- Check firestore.rules syntax is valid
- Ensure you have proper permissions for the Firebase project 