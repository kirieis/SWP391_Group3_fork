public class IntStack {
    private int[] items;
    private int top;

    public IntStack(int capacity) {
        items = new int[capacity];
        top = -1;
    }

    public void push(int value) {
        if (top == items.length - 1) {
            grow();
        }
        top++;
        items[top] = value;
    }

    public int pop() {
        if (top < 0) {
            throw new RuntimeException("Stack is empty");
        }
        int value = items[top];
        top--;
        return value;
    }

    public int peek() {
        if (top < 0) {
            throw new RuntimeException("Stack is empty");
        }
        return items[top];
    }

    public boolean isEmpty() {
        return top == -1;
    }

    public int size() {
        return top + 1;
    }

    private void grow() {
        int[] bigger = new int[items.length * 2];
        for (int i = 0; i < items.length; i++) {
            bigger[i] = items[i];
        }
        items = bigger;
    }

    public static void main(String[] args) {
        IntStack stack = new IntStack(2);
        for (int i = 1; i <= 5; i++) {
            stack.push(i * 10);
        }
        System.out.println("size = " + stack.size());
        while (!stack.isEmpty()) {
            System.out.println(stack.pop());
        }
    }
}
