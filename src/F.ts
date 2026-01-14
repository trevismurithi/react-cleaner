const ComponentF = () => {
  return <div>F</div>;
};

const ComponentF2 = () => {
  return <div>F2</div>;
};

const CONNECTIONS = [
  {
    file: "A.tsx",
    source: "B.tsx",
    names: ["ComponentD", "ComponentC"],
    type: "re-export",
  },
  
];

export { ComponentF, ComponentF2, CONNECTIONS };