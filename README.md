# 🥟 Dukaan POS — billing app for small snack sellers

A phone app for selling samosas, rolls, chai and other snacks. It runs in the phone's browser and can be added to the home screen. It uses **Firebase** for login and data, the code lives on **GitHub**, and it is hosted on **Vercel** for free.

## Features
- **Items**: add name, sale price, cost price, photo and barcode. You can scan an existing barcode or make a new one and print labels.
- **Sell screen**: shows item photos. Tap an item to add 1. Hold an item to type a quantity. You can also search by name, scan with the camera (scanning many items in a row works), or use a USB/Bluetooth barcode gun.
- **Bill**: change quantities with + and −, add a discount, see the total, and choose **Cash** (it works out the change) or **Transfer** (with an optional reference).
- **WhatsApp bill**: send the receipt to the customer's number (for example 03001234567 becomes 923001234567). Bills can also be printed on a 58 mm printer.
- **Accounts**: choose Today, Yesterday, 7 days, This month or your own dates. It shows total sales, number of bills, cash vs transfer, discounts, cost, expenses, gross profit, net profit, top items and the list of bills. You can open any bill to resend it or delete it, and download a CSV file for Excel.
- **Works offline**: sales are saved on the phone and sync when the internet comes back.
- **Login per shop**: each seller sees only their own data.

## Setup (about 15 minutes)

### 1. Firebase
1. Go to https://console.firebase.google.com and click **Add project**.
2. Open **Build → Authentication → Get started** and turn on **Email/Password**.
3. Open **Build → Firestore Database → Create database** and choose **Production mode**. Pick a nearby region.
4. In **Firestore → Rules**, paste everything from `firestore.rules` and click **Publish**.
5. Open **Project settings (⚙️) → Your apps → Web (</>)** and register an app. Copy the `firebaseConfig` values into `firebase-config.js`.

> Photos are made small and saved inside Firestore, so you **don't need** Firebase Storage. Storage needs a paid plan, but this app works on the free Spark plan.

### 2. GitHub
```bash
git init
git add .
git commit -m "Dukaan POS"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/dukaan-pos.git
git push -u origin main
```

### 3. Vercel
1. Go to https://vercel.com, sign in with GitHub, click **Add New → Project** and import `dukaan-pos`.
2. Set Framework Preset to **Other**. No build command is needed. Click **Deploy**.
3. Copy your link, for example `dukaan-pos.vercel.app`.
4. Back in Firebase, open **Authentication → Settings → Authorized domains** and add that domain.

Every `git push` updates the live app automatically.

### 4. Use it on the phone
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
shops/{userId}                → shop settings
shops/{userId}/items/{id}     → name, price, cost, barcode, photo
shops/{userId}/sales/{id}     → billNo, lines[], total, discount, payment, customer, createdAtMs
shops/{userId}/expenses/{id}  → title, amount, createdAtMs
```

## Notes
- The camera scanner only works on **https**. Vercel uses https, so it works there.
- The free Firebase plan allows 50,000 reads and 20,000 writes per day, which is plenty for a small shop.
- To share one shop with a helper, log in with the **same account** on both phones.
