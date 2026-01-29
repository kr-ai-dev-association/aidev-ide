# Android 개발 규칙 (필수 준수)

## 1. ConstraintLayout 속성 규칙 (빌드 에러 방지)

### 절대 사용 금지 (존재하지 않는 속성)
```
layout_constraintTop_margin      ← 존재하지 않음
layout_constraintBottom_margin   ← 존재하지 않음
layout_constraintStart_margin    ← 존재하지 않음
layout_constraintEnd_margin      ← 존재하지 않음
layout_constraintMarginStart     ← 존재하지 않음
layout_constraintMarginTop       ← 존재하지 않음
```

### 올바른 margin 속성
```xml
android:layout_marginTop="16dp"
android:layout_marginBottom="16dp"
android:layout_marginStart="16dp"
android:layout_marginEnd="16dp"
android:layout_marginHorizontal="16dp"
android:layout_marginVertical="16dp"
```

### ConstraintLayout constraint 속성 (연결용)
```xml
app:layout_constraintTop_toTopOf="parent"
app:layout_constraintTop_toBottomOf="@id/other_view"
app:layout_constraintBottom_toBottomOf="parent"
app:layout_constraintStart_toStartOf="parent"
app:layout_constraintEnd_toEndOf="parent"
```

---

## 2. 리소스 파일 규칙

### 절대 금지
- 존재하지 않는 `@style/`, `@color/`, `@drawable/` 참조 금지
- 디자인 문서에 있다고 해서 리소스가 존재한다고 가정 금지
- 빌드 에러 해결을 위해 styles.xml, colors.xml, themes.xml 임의 생성 금지

### 필수 사항
- 새 리소스 참조 전에 해당 파일이 존재하는지 확인
- 인라인 속성 우선 사용 (리소스 파일 의존 최소화)
- 필요시 사용자에게 리소스 생성 여부 확인

---

## 3. Activity 등록 규칙 (런타임 크래시 방지)

### 🚨 가장 흔한 크래시 원인
```
ActivityNotFoundException: Unable to find explicit activity class
have you declared this activity in your AndroidManifest.xml?
```

**원인**: Activity 클래스는 만들었지만 AndroidManifest.xml에 등록 안 함

---

### 새 Activity 추가 시 필수 3단계

| 순서 | 작업 | 파일 |
|------|------|------|
| 1 | Activity 클래스 생성 | `NewActivity.kt` |
| 2 | 레이아웃 파일 생성 | `activity_new.xml` |
| 3 | **Manifest에 등록** | `AndroidManifest.xml` |

**3번을 빠뜨리면 앱이 크래시합니다!**

---

### AndroidManifest.xml 등록 예시

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application ...>

        <!-- 기존 MainActivity -->
        <activity
            android:name=".ui.main.MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- 🔥 새로 추가하는 Activity는 반드시 여기에 등록 -->
        <activity
            android:name=".ui.main.SignUpActivity"
            android:exported="false" />

        <activity
            android:name=".ui.settings.SettingsActivity"
            android:exported="false" />

    </application>
</manifest>
```

---

### exported 속성 규칙
| 값 | 사용 |
|----|------|
| `true` | LAUNCHER Activity만 (앱 시작점) |
| `false` | 나머지 모든 Activity |

---

### 화면 이동(Intent) 구현 시 체크리스트

버튼 클릭 → 다른 화면 이동 기능을 만들 때:

```kotlin
// MainActivity.kt
binding.btnSignUp.setOnClickListener {
    startActivity(Intent(this, SignUpActivity::class.java))
}
```

**위 코드가 동작하려면:**
1. ✅ `SignUpActivity.kt` 파일 존재
2. ✅ `activity_sign_up.xml` 파일 존재
3. ✅ **AndroidManifest.xml에 `<activity android:name=".ui.main.SignUpActivity" />` 등록**

---

### 패키지 경로 주의사항

Activity의 패키지 경로에 따라 Manifest 등록 방식이 다릅니다:

```kotlin
// 파일 위치: app/src/main/java/com/example/myapp/ui/auth/SignUpActivity.kt
package com.example.myapp.ui.auth

class SignUpActivity : AppCompatActivity() { ... }
```

```xml
<!-- AndroidManifest.xml -->
<!-- 패키지 경로를 정확히 맞춰야 함 -->
<activity android:name=".ui.auth.SignUpActivity" />

<!-- 또는 전체 경로 -->
<activity android:name="com.example.myapp.ui.auth.SignUpActivity" />
```

---

## 4. UI 컴포넌트 기본 템플릿

### 4.1 버튼 (MaterialButton)
```xml
<com.google.android.material.button.MaterialButton
    android:id="@+id/btn_action"
    android:layout_width="0dp"
    android:layout_height="56dp"
    android:text="버튼 텍스트"
    android:textSize="16sp"
    android:textColor="@android:color/white"
    app:cornerRadius="12dp"
    app:backgroundTint="#6200EE"
    app:layout_constraintTop_toBottomOf="@id/previous_view"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintEnd_toEndOf="parent"
    android:layout_marginTop="16dp"
    android:layout_marginHorizontal="16dp" />
```

### 4.2 텍스트 입력 (TextInputLayout)
```xml
<com.google.android.material.textfield.TextInputLayout
    android:id="@+id/til_email"
    android:layout_width="0dp"
    android:layout_height="wrap_content"
    android:hint="이메일"
    app:boxCornerRadiusTopStart="12dp"
    app:boxCornerRadiusTopEnd="12dp"
    app:boxCornerRadiusBottomStart="12dp"
    app:boxCornerRadiusBottomEnd="12dp"
    app:layout_constraintTop_toTopOf="parent"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintEnd_toEndOf="parent"
    android:layout_marginTop="24dp"
    android:layout_marginHorizontal="16dp">

    <com.google.android.material.textfield.TextInputEditText
        android:id="@+id/et_email"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:inputType="textEmailAddress" />

</com.google.android.material.textfield.TextInputLayout>
```

### 4.3 비밀번호 입력 (Toggle 포함)
```xml
<com.google.android.material.textfield.TextInputLayout
    android:id="@+id/til_password"
    android:layout_width="0dp"
    android:layout_height="wrap_content"
    android:hint="비밀번호"
    app:endIconMode="password_toggle"
    app:boxCornerRadiusTopStart="12dp"
    app:boxCornerRadiusTopEnd="12dp"
    app:boxCornerRadiusBottomStart="12dp"
    app:boxCornerRadiusBottomEnd="12dp"
    app:layout_constraintTop_toBottomOf="@id/til_email"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintEnd_toEndOf="parent"
    android:layout_marginTop="16dp"
    android:layout_marginHorizontal="16dp">

    <com.google.android.material.textfield.TextInputEditText
        android:id="@+id/et_password"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:inputType="textPassword" />

</com.google.android.material.textfield.TextInputLayout>
```

### 4.4 카드뷰
```xml
<com.google.android.material.card.MaterialCardView
    android:id="@+id/card_item"
    android:layout_width="0dp"
    android:layout_height="wrap_content"
    app:cardCornerRadius="16dp"
    app:cardElevation="4dp"
    app:strokeWidth="0dp"
    android:layout_marginHorizontal="16dp"
    android:layout_marginTop="12dp"
    app:layout_constraintTop_toBottomOf="@id/previous_view"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintEnd_toEndOf="parent">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical"
        android:padding="16dp">

        <TextView
            android:id="@+id/tv_title"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="제목"
            android:textSize="18sp"
            android:textColor="#212121"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/tv_description"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="설명 텍스트"
            android:textSize="14sp"
            android:textColor="#757575"
            android:layout_marginTop="8dp" />

    </LinearLayout>

</com.google.android.material.card.MaterialCardView>
```

### 4.5 설정 항목 (Switch)
```xml
<LinearLayout
    android:id="@+id/setting_item"
    android:layout_width="0dp"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:padding="16dp"
    android:gravity="center_vertical"
    android:background="?attr/selectableItemBackground"
    app:layout_constraintTop_toBottomOf="@id/previous_view"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintEnd_toEndOf="parent">

    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_weight="1"
        android:orientation="vertical">

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="알림 설정"
            android:textSize="16sp"
            android:textColor="#212121" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="푸시 알림을 받습니다"
            android:textSize="14sp"
            android:textColor="#757575"
            android:layout_marginTop="4dp" />

    </LinearLayout>

    <com.google.android.material.switchmaterial.SwitchMaterial
        android:id="@+id/switch_notification"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content" />

</LinearLayout>
```

### 4.6 리스트 아이템 (RecyclerView용)
```xml
<?xml version="1.0" encoding="utf-8"?>
<com.google.android.material.card.MaterialCardView
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    app:cardCornerRadius="12dp"
    app:cardElevation="2dp"
    app:strokeWidth="0dp"
    android:layout_marginHorizontal="16dp"
    android:layout_marginVertical="6dp">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:padding="16dp"
        android:gravity="center_vertical">

        <!-- 아이콘 -->
        <ImageView
            android:id="@+id/iv_icon"
            android:layout_width="48dp"
            android:layout_height="48dp"
            android:src="@drawable/ic_launcher_foreground"
            android:background="#F5F5F5"
            android:padding="8dp"
            android:contentDescription="아이콘" />

        <!-- 텍스트 영역 -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical"
            android:layout_marginStart="16dp">

            <TextView
                android:id="@+id/tv_title"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="제목"
                android:textSize="16sp"
                android:textColor="#212121"
                android:textStyle="bold"
                android:maxLines="1"
                android:ellipsize="end" />

            <TextView
                android:id="@+id/tv_subtitle"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="부제목"
                android:textSize="14sp"
                android:textColor="#757575"
                android:layout_marginTop="4dp"
                android:maxLines="2"
                android:ellipsize="end" />

        </LinearLayout>

        <!-- 화살표 -->
        <ImageView
            android:layout_width="24dp"
            android:layout_height="24dp"
            android:src="@android:drawable/ic_media_play"
            android:rotation="0"
            android:alpha="0.5"
            android:contentDescription="더보기" />

    </LinearLayout>

</com.google.android.material.card.MaterialCardView>
```

### 4.7 FAB (Floating Action Button)
```xml
<com.google.android.material.floatingactionbutton.FloatingActionButton
    android:id="@+id/fab_add"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:src="@android:drawable/ic_input_add"
    android:contentDescription="추가"
    app:backgroundTint="#6200EE"
    app:tint="@android:color/white"
    app:layout_constraintBottom_toBottomOf="parent"
    app:layout_constraintEnd_toEndOf="parent"
    android:layout_marginEnd="16dp"
    android:layout_marginBottom="16dp" />
```

### 4.8 로딩 인디케이터
```xml
<com.google.android.material.progressindicator.CircularProgressIndicator
    android:id="@+id/progress_loading"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:indeterminate="true"
    android:visibility="gone"
    app:indicatorColor="#6200EE"
    app:layout_constraintTop_toTopOf="parent"
    app:layout_constraintBottom_toBottomOf="parent"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintEnd_toEndOf="parent" />
```

### 4.9 Empty State (데이터 없음)
```xml
<LinearLayout
    android:id="@+id/layout_empty"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:gravity="center"
    android:visibility="gone"
    app:layout_constraintTop_toTopOf="parent"
    app:layout_constraintBottom_toBottomOf="parent"
    app:layout_constraintStart_toStartOf="parent"
    app:layout_constraintEnd_toEndOf="parent">

    <ImageView
        android:layout_width="120dp"
        android:layout_height="120dp"
        android:src="@android:drawable/ic_menu_search"
        android:alpha="0.3"
        android:contentDescription="데이터 없음" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="데이터가 없습니다"
        android:textSize="18sp"
        android:textColor="#757575"
        android:layout_marginTop="16dp" />

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="새로운 항목을 추가해보세요"
        android:textSize="14sp"
        android:textColor="#9E9E9E"
        android:layout_marginTop="8dp" />

    <com.google.android.material.button.MaterialButton
        android:id="@+id/btn_add_first"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="추가하기"
        android:layout_marginTop="24dp"
        app:cornerRadius="8dp" />

</LinearLayout>
```

---

## 5. 화면 레이아웃 템플릿

### 5.1 기본 화면 구조
```xml
<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#FAFAFA">

    <!-- Toolbar -->
    <com.google.android.material.appbar.MaterialToolbar
        android:id="@+id/toolbar"
        android:layout_width="0dp"
        android:layout_height="?attr/actionBarSize"
        android:background="@android:color/white"
        android:elevation="4dp"
        app:title="화면 제목"
        app:titleTextColor="#212121"
        app:navigationIcon="@drawable/ic_launcher_foreground"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent" />

    <!-- Content Area -->
    <androidx.core.widget.NestedScrollView
        android:id="@+id/scroll_content"
        android:layout_width="0dp"
        android:layout_height="0dp"
        app:layout_constraintTop_toBottomOf="@id/toolbar"
        app:layout_constraintBottom_toTopOf="@id/btn_bottom"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:padding="16dp">

            <!-- 여기에 콘텐츠 추가 -->

        </LinearLayout>

    </androidx.core.widget.NestedScrollView>

    <!-- 하단 고정 버튼 -->
    <com.google.android.material.button.MaterialButton
        android:id="@+id/btn_bottom"
        android:layout_width="0dp"
        android:layout_height="56dp"
        android:text="확인"
        app:cornerRadius="0dp"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent" />

</androidx.constraintlayout.widget.ConstraintLayout>
```

### 5.2 로그인 화면
```xml
<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@android:color/white">

    <!-- 로고 -->
    <ImageView
        android:id="@+id/iv_logo"
        android:layout_width="120dp"
        android:layout_height="120dp"
        android:src="@drawable/ic_launcher_foreground"
        android:contentDescription="로고"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="80dp" />

    <!-- 앱 이름 -->
    <TextView
        android:id="@+id/tv_app_name"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="앱 이름"
        android:textSize="28sp"
        android:textColor="#212121"
        android:textStyle="bold"
        app:layout_constraintTop_toBottomOf="@id/iv_logo"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="16dp" />

    <!-- 이메일 입력 -->
    <com.google.android.material.textfield.TextInputLayout
        android:id="@+id/til_email"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:hint="이메일"
        app:boxCornerRadiusTopStart="12dp"
        app:boxCornerRadiusTopEnd="12dp"
        app:boxCornerRadiusBottomStart="12dp"
        app:boxCornerRadiusBottomEnd="12dp"
        app:layout_constraintTop_toBottomOf="@id/tv_app_name"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="48dp"
        android:layout_marginHorizontal="24dp">

        <com.google.android.material.textfield.TextInputEditText
            android:id="@+id/et_email"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:inputType="textEmailAddress" />

    </com.google.android.material.textfield.TextInputLayout>

    <!-- 비밀번호 입력 -->
    <com.google.android.material.textfield.TextInputLayout
        android:id="@+id/til_password"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:hint="비밀번호"
        app:endIconMode="password_toggle"
        app:boxCornerRadiusTopStart="12dp"
        app:boxCornerRadiusTopEnd="12dp"
        app:boxCornerRadiusBottomStart="12dp"
        app:boxCornerRadiusBottomEnd="12dp"
        app:layout_constraintTop_toBottomOf="@id/til_email"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="16dp"
        android:layout_marginHorizontal="24dp">

        <com.google.android.material.textfield.TextInputEditText
            android:id="@+id/et_password"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:inputType="textPassword" />

    </com.google.android.material.textfield.TextInputLayout>

    <!-- 로그인 유지 체크박스 -->
    <com.google.android.material.checkbox.MaterialCheckBox
        android:id="@+id/cb_remember"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="로그인 유지"
        android:textSize="14sp"
        android:textColor="#757575"
        app:layout_constraintTop_toBottomOf="@id/til_password"
        app:layout_constraintStart_toStartOf="@id/til_password"
        android:layout_marginTop="8dp" />

    <!-- 로그인 버튼 -->
    <com.google.android.material.button.MaterialButton
        android:id="@+id/btn_login"
        android:layout_width="0dp"
        android:layout_height="56dp"
        android:text="로그인"
        android:textSize="16sp"
        app:cornerRadius="12dp"
        app:backgroundTint="#6200EE"
        app:layout_constraintTop_toBottomOf="@id/cb_remember"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="24dp"
        android:layout_marginHorizontal="24dp" />

    <!-- 하단 링크 -->
    <LinearLayout
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        app:layout_constraintTop_toBottomOf="@id/btn_login"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginTop="16dp">

        <TextView
            android:id="@+id/tv_forgot_password"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="비밀번호 찾기"
            android:textSize="14sp"
            android:textColor="#6200EE"
            android:padding="8dp" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="|"
            android:textSize="14sp"
            android:textColor="#BDBDBD"
            android:layout_marginHorizontal="8dp" />

        <TextView
            android:id="@+id/tv_sign_up"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="회원가입"
            android:textSize="14sp"
            android:textColor="#6200EE"
            android:padding="8dp" />

    </LinearLayout>

    <!-- 로딩 인디케이터 -->
    <com.google.android.material.progressindicator.CircularProgressIndicator
        android:id="@+id/progress_loading"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:indeterminate="true"
        android:visibility="gone"
        app:indicatorColor="#6200EE"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent" />

</androidx.constraintlayout.widget.ConstraintLayout>
```

### 5.3 리스트 화면 (RecyclerView)
```xml
<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#FAFAFA">

    <!-- Toolbar -->
    <com.google.android.material.appbar.MaterialToolbar
        android:id="@+id/toolbar"
        android:layout_width="0dp"
        android:layout_height="?attr/actionBarSize"
        android:background="@android:color/white"
        android:elevation="4dp"
        app:title="목록"
        app:titleTextColor="#212121"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent" />

    <!-- RecyclerView -->
    <androidx.recyclerview.widget.RecyclerView
        android:id="@+id/rv_list"
        android:layout_width="0dp"
        android:layout_height="0dp"
        android:clipToPadding="false"
        android:paddingTop="8dp"
        android:paddingBottom="80dp"
        app:layoutManager="androidx.recyclerview.widget.LinearLayoutManager"
        app:layout_constraintTop_toBottomOf="@id/toolbar"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent" />

    <!-- Empty State -->
    <LinearLayout
        android:id="@+id/layout_empty"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:orientation="vertical"
        android:gravity="center"
        android:visibility="gone"
        app:layout_constraintTop_toBottomOf="@id/toolbar"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent">

        <ImageView
            android:layout_width="100dp"
            android:layout_height="100dp"
            android:src="@android:drawable/ic_menu_agenda"
            android:alpha="0.3"
            android:contentDescription="데이터 없음" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="항목이 없습니다"
            android:textSize="16sp"
            android:textColor="#757575"
            android:layout_marginTop="16dp" />

    </LinearLayout>

    <!-- FAB -->
    <com.google.android.material.floatingactionbutton.FloatingActionButton
        android:id="@+id/fab_add"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:src="@android:drawable/ic_input_add"
        android:contentDescription="추가"
        app:backgroundTint="#6200EE"
        app:tint="@android:color/white"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        android:layout_marginEnd="16dp"
        android:layout_marginBottom="16dp" />

    <!-- 로딩 인디케이터 -->
    <com.google.android.material.progressindicator.CircularProgressIndicator
        android:id="@+id/progress_loading"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:indeterminate="true"
        android:visibility="gone"
        app:indicatorColor="#6200EE"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent" />

</androidx.constraintlayout.widget.ConstraintLayout>
```

### 5.4 설정 화면
```xml
<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#FAFAFA">

    <!-- Toolbar -->
    <com.google.android.material.appbar.MaterialToolbar
        android:id="@+id/toolbar"
        android:layout_width="0dp"
        android:layout_height="?attr/actionBarSize"
        android:background="@android:color/white"
        android:elevation="4dp"
        app:title="설정"
        app:titleTextColor="#212121"
        app:navigationIcon="@drawable/ic_launcher_foreground"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent" />

    <androidx.core.widget.NestedScrollView
        android:layout_width="0dp"
        android:layout_height="0dp"
        app:layout_constraintTop_toBottomOf="@id/toolbar"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:paddingVertical="8dp">

            <!-- 섹션 헤더 -->
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="알림"
                android:textSize="14sp"
                android:textColor="#6200EE"
                android:textStyle="bold"
                android:paddingHorizontal="16dp"
                android:paddingVertical="12dp" />

            <!-- 설정 항목 1: Switch -->
            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:padding="16dp"
                android:gravity="center_vertical"
                android:background="@android:color/white">

                <LinearLayout
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:orientation="vertical">

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="푸시 알림"
                        android:textSize="16sp"
                        android:textColor="#212121" />

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="새로운 소식을 알려드립니다"
                        android:textSize="14sp"
                        android:textColor="#757575"
                        android:layout_marginTop="4dp" />

                </LinearLayout>

                <com.google.android.material.switchmaterial.SwitchMaterial
                    android:id="@+id/switch_push"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:checked="true" />

            </LinearLayout>

            <!-- 구분선 -->
            <View
                android:layout_width="match_parent"
                android:layout_height="1dp"
                android:background="#E0E0E0"
                android:layout_marginStart="16dp" />

            <!-- 설정 항목 2: Switch -->
            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:padding="16dp"
                android:gravity="center_vertical"
                android:background="@android:color/white">

                <LinearLayout
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:orientation="vertical">

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="이메일 알림"
                        android:textSize="16sp"
                        android:textColor="#212121" />

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="이메일로 알림을 받습니다"
                        android:textSize="14sp"
                        android:textColor="#757575"
                        android:layout_marginTop="4dp" />

                </LinearLayout>

                <com.google.android.material.switchmaterial.SwitchMaterial
                    android:id="@+id/switch_email"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:checked="false" />

            </LinearLayout>

            <!-- 섹션 헤더 -->
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="계정"
                android:textSize="14sp"
                android:textColor="#6200EE"
                android:textStyle="bold"
                android:paddingHorizontal="16dp"
                android:paddingTop="24dp"
                android:paddingBottom="12dp" />

            <!-- 설정 항목 3: 클릭 가능 -->
            <LinearLayout
                android:id="@+id/btn_profile"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:padding="16dp"
                android:gravity="center_vertical"
                android:background="?attr/selectableItemBackground">

                <TextView
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="프로필 수정"
                    android:textSize="16sp"
                    android:textColor="#212121" />

                <ImageView
                    android:layout_width="24dp"
                    android:layout_height="24dp"
                    android:src="@android:drawable/ic_media_play"
                    android:alpha="0.3"
                    android:contentDescription="이동" />

            </LinearLayout>

            <!-- 구분선 -->
            <View
                android:layout_width="match_parent"
                android:layout_height="1dp"
                android:background="#E0E0E0"
                android:layout_marginStart="16dp" />

            <!-- 설정 항목 4: 로그아웃 -->
            <TextView
                android:id="@+id/btn_logout"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="로그아웃"
                android:textSize="16sp"
                android:textColor="#F44336"
                android:padding="16dp"
                android:background="?attr/selectableItemBackground" />

        </LinearLayout>

    </androidx.core.widget.NestedScrollView>

</androidx.constraintlayout.widget.ConstraintLayout>
```

---

## 6. 색상 팔레트 (인라인 사용)

### Primary Colors
```
Primary: #6200EE
Primary Dark: #3700B3
Primary Light: #BB86FC
```

### Accent Colors
```
Accent: #03DAC6
Accent Dark: #018786
```

### Text Colors
```
Text Primary: #212121
Text Secondary: #757575
Text Disabled: #9E9E9E
Text Hint: #BDBDBD
```

### Background Colors
```
Background: #FAFAFA
Surface: #FFFFFF
Divider: #E0E0E0
```

### Semantic Colors
```
Success: #4CAF50
Warning: #FF9800
Error: #F44336
Info: #2196F3
```

---

## 7. 접근성 규칙

### 최소 터치 영역
```xml
android:minWidth="48dp"
android:minHeight="48dp"
```

### contentDescription 필수
```xml
<ImageView
    android:contentDescription="이미지 설명" />

<ImageButton
    android:contentDescription="버튼 설명" />
```

---

## 8. 빠른 참조

### 간격
- 화면 여백: `16dp` ~ `24dp`
- 컴포넌트 간격: `8dp` ~ `16dp`
- 내부 패딩: `12dp` ~ `16dp`

### 텍스트 크기
- Headline: `24sp` ~ `28sp`
- Title: `18sp` ~ `20sp`
- Body: `14sp` ~ `16sp`
- Caption: `12sp`

### Corner Radius
- 버튼: `8dp` ~ `12dp`
- 카드: `12dp` ~ `16dp`
- 입력 필드: `12dp`

### Elevation
- 카드: `2dp` ~ `4dp`
- Toolbar: `4dp`
- FAB: `6dp`
