import { useState } from "react";

function ButtonExample() {
  const [text, setText] = useState("Hello! Click the button.");

  return (
    <div>
      <h2>{text}</h2>
      <button onClick={() => setText("🎉 You clicked the button!")}>
        Click Me
      </button>
    </div>
  );
}

export default ButtonExample;
