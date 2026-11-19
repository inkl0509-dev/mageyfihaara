# 🥟 Magey Fihaara — billing app for small snack sellers

All prices, bills and accounts are in **MVR (Maldivian Rufiyaa)**.

A phone app for selling samosas, rolls, chai and other snacks. It runs in the phone's browser and can be added to the home screen. It uses **Firebase** for login and data, the code lives on **GitHub**, and it is hosted on **Vercel** for free.

## Features
- **Many shops, one app**: the admin creates shops and each shop gets a secret code (e.g. `K7PM-3QXD`). A seller creates a login, types the code once, and becomes part of that shop. **Shops can never see each other's data.** This is enforced by Firebase security rules on the server, not just hidden in the app. The admin sees shop names, codes and logged-in phones, but **not** the shops' sales, items or accounts.
- **Items**: add name, sale price, cost price, photo and barcode. You can scan an existing barcode or make a new one and print labels.
- **Sell screen**: shows item photos. Tap an item to add 1. Hold an item to type a quantity. You can also search by name, scan with the camera (scanning many items in a row works), or use a USB/Bluetooth barcode gun.
- **Bill**: change quantities with + and −, add a discount, see the total, and choose **Cash** (it works out the change) or **Transfer** (with an optional reference).
- **WhatsApp bill**: send the receipt to the customer's number (type the 7-digit Maldives number, e.g. 7771234, and it becomes 9607771234). Bills can also be printed on a 58 mm printer.
- **Accounts**: choose Today, Yesterday, 7 days, This month or your own dates. It shows total sales, number of bills, cash vs transfer, discounts, cost, expenses, gross profit, net profit, top items and the list of bills. You can open any bill to resend it or delete it, and download a CSV file for Excel.
- **Works offline**: sales are saved on the phone and sync when the internet comes back.
- **Login per shop**: each seller sees only their own data.

## Setup (about 15 minutes)

### 1. Firebase
1. Go to https://console.firebase.google.com and click **Add project**.
2. Open **Build → Authentication → Get started** and turn on **Email/Password**.
3. Open **Build → Firestore Database → Create database** and choose **Production mode**. Pick a nearby region.
4. In **Firestore → Rules**, paste everything from `firestore.rules` and click **Publish**.
   (If you used an older version of this app, delete the old test data first. The data layout has changed.)
5. Open **Project settings (⚙️) → Your apps → Web (</>)** and register an app. Copy the `firebaseConfig` values into `firebase-config.js`.

> Photos are made small and saved inside Firestore, so you **don't need** Firebase Storage. Storage needs a paid plan, but this app works on the free Spark plan.

### 2. GitHub
```bash
git init
git add .
git commit -m "Magey Fihaara"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/magey-fihaara.git
git push -u origin main
```

### 3. Vercel
1. Go to https://vercel.com, sign in with GitHub, click **Add New → Project** and import `magey-fihaara`.
2. Set Framework Preset to **Other**. No build command is needed. Click **Deploy**.
3. Copy your link, for example `magey-fihaara.vercel.app`.
4. Back in Firebase, open **Authentication → Settings → Authorized domains** and add that domain.

Every `git push` updates the live app automatically.

### 4. Make yourself the admin (one time)
1. Open the app and **Create new account** with your own email. It will ask for a shop code. Leave it there.
2. In Firebase Console open **Authentication → Users** and copy your **User UID**.
3. Open **Firestore Database → Start collection**. Set the Collection ID to `admins` and the Document ID to *your User UID*. Add any field, for example `name` = `Admin`, then click **Save**.
4. Reload the app. You will now see the **Admin** screen.

### 5. Open a shop
1. On the Admin screen, type the shop name and click **+ Create**. A code appears.
2. Click **Share code** to send it on WhatsApp to the shop owner.
3. The owner opens the app on their phone, creates an account and enters the code. That shop now works only for them.
4. A helper's phone can join the **same shop** with the same code.

**Admin buttons**
- **New code**: the old code stops working for new phones. Phones already in the shop keep working.
- **Turn off / Turn on**: blocks or unblocks the whole shop, for example if they haven't paid.
- **✕ next to a phone**: removes that phone from the shop. It will need a code again.

### 6. Use it on the phone
- Open the Vercel link in **Chrome** (Android) or **Safari** (iPhone).
- Choose **Menu → Add to Home screen**. It will open like a normal app.
- Create an account, set your shop name in **⚙️ Settings**, then add items in **📦 Items**.

## Files
| File | What it does |
|---|---|
| `index.html` | Screens and pop-ups |
| `app.js` | All app logic |
| `style.css` | Mobile design |
| `firebase-config.js` | Your Firebase keys (edit this) |
| `firestore.rules` | Security: each shop sees only its own data |
| `manifest.json`, `icons/` | Home-screen app icon |

## Data layout (Firestore)
```
admins/{userId}               → who is admin (you create this by hand)
codes/{CODE}                  → shopId (secret join codes)
users/{userId}                → shopId this phone/user belongs to
shops/{shopId}                → shop name, phone, address, footer, code, active
shops/{shopId}/items/{id}     → name, price, cost, barcode, photo      (only this shop's users)
shops/{shopId}/sales/{id}     → bills                                  (only this shop's users)
shops/{shopId}/expenses/{id}  → expenses                               (only this shop's users)
```

## Notes
- The camera scanner only works on **https**. Vercel uses https, so it works there.
- The free Firebase plan allows 50,000 reads and 20,000 writes per day, which is plenty for a small shop.
- One login belongs to one shop. To sell in two shops, use two different emails.
